package traceflow

import (
	"context"
	"sync"
)

// TraceHandle manages the lifecycle of a single trace. It is safe for
// concurrent use. Finish, Fail, and Cancel are idempotent: the first call wins
// and subsequent calls are no-ops.
type TraceHandle struct {
	traceID string
	source  string
	emit    func(context.Context, TraceEvent) error
	logger  Logger
	onClose func()

	mu     sync.Mutex
	closed bool
	steps  []*StepHandle
}

// TraceID returns the trace's unique identifier.
func (h *TraceHandle) TraceID() string { return h.traceID }

// IsClosed reports whether the trace has been finished, failed, or cancelled.
func (h *TraceHandle) IsClosed() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.closed
}

// markClosed transitions the handle to closed exactly once. It returns false if
// the handle was already closed.
func (h *TraceHandle) markClosed() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		h.logger.Warn("Trace %s already closed", h.traceID)
		return false
	}
	h.closed = true
	return true
}

// Finish completes the trace successfully, cascading closure to any open steps.
func (h *TraceHandle) Finish(ctx context.Context, opts FinishTraceOptions) error {
	if !h.markClosed() {
		return nil
	}
	h.closeOrphanedSteps(ctx, "Parent trace finished")
	if h.onClose != nil {
		h.onClose()
	}
	return h.emit(ctx, newTraceEvent(EventTraceFinished, h.traceID, h.source, map[string]any{
		"result":   opts.Result,
		"metadata": opts.Metadata,
	}, ""))
}

// Fail marks the trace as failed, cascading closure to any open steps.
func (h *TraceHandle) Fail(ctx context.Context, err error, opts FailTraceOptions) error {
	if !h.markClosed() {
		return nil
	}
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	h.closeOrphanedSteps(ctx, msg)
	if h.onClose != nil {
		h.onClose()
	}
	return h.emit(ctx, newTraceEvent(EventTraceFailed, h.traceID, h.source, map[string]any{
		"error":    msg,
		"result":   opts.Result,
		"metadata": opts.Metadata,
	}, ""))
}

// Cancel marks the trace as cancelled, cascading closure to any open steps.
func (h *TraceHandle) Cancel(ctx context.Context) error {
	if !h.markClosed() {
		return nil
	}
	h.closeOrphanedSteps(ctx, "Parent trace cancelled")
	if h.onClose != nil {
		h.onClose()
	}
	return h.emit(ctx, newTraceEvent(EventTraceCancelled, h.traceID, h.source, map[string]any{}, ""))
}

// StartStep begins a new step within this trace. The step is tracked so it can
// be auto-closed if the trace ends while the step is still open.
func (h *TraceHandle) StartStep(ctx context.Context, opts StartStepOptions) (*StepHandle, error) {
	stepID := ensureValidUUID(opts.StepID, h.logger, "step_id")

	if err := h.emit(ctx, newTraceEvent(EventStepStarted, h.traceID, h.source, map[string]any{
		"name":      opts.Name,
		"step_type": opts.StepType,
		"input":     opts.Input,
		"metadata":  opts.Metadata,
	}, stepID)); err != nil {
		return nil, err
	}

	step := &StepHandle{
		stepID:  stepID,
		traceID: h.traceID,
		source:  h.source,
		emit:    h.emit,
		logger:  h.logger,
	}
	h.mu.Lock()
	h.steps = append(h.steps, step)
	h.mu.Unlock()
	return step, nil
}

// WithStep starts a step, runs fn, then finishes the step with fn's result on
// success or fails it on error. The error from fn is always propagated.
func (h *TraceHandle) WithStep(ctx context.Context, opts StartStepOptions, fn func(ctx context.Context, step *StepHandle) error) error {
	step, err := h.StartStep(ctx, opts)
	if err != nil {
		return err
	}
	stepCtx := ContextWithStep(ContextWithTrace(ctx, h.traceID), step.stepID)
	if runErr := fn(stepCtx, step); runErr != nil {
		_ = step.Fail(ctx, runErr, FailStepOptions{})
		return runErr
	}
	return step.Finish(ctx, FinishStepOptions{})
}

// Log emits a log line associated with this trace.
func (h *TraceHandle) Log(ctx context.Context, message string, opts LogOptions) error {
	level := opts.Level
	if level == "" {
		level = LogInfo
	}
	return h.emit(ctx, newTraceEvent(EventLogEmitted, h.traceID, h.source, map[string]any{
		"message":    message,
		"level":      level,
		"event_type": opts.EventType,
		"details":    opts.Details,
	}, opts.StepID))
}

func (h *TraceHandle) closeOrphanedSteps(ctx context.Context, reason string) {
	h.mu.Lock()
	steps := h.steps
	h.steps = nil
	h.mu.Unlock()

	reasonErr := stringError(reason)
	for _, step := range steps {
		if !step.IsClosed() {
			_ = step.Fail(ctx, reasonErr, FailStepOptions{})
		}
	}
}

// StepHandle manages the lifecycle of a single step. It is safe for concurrent
// use. Finish and Fail are idempotent.
type StepHandle struct {
	stepID  string
	traceID string
	source  string
	emit    func(context.Context, TraceEvent) error
	logger  Logger

	mu     sync.Mutex
	closed bool
}

// StepID returns the step's unique identifier.
func (s *StepHandle) StepID() string { return s.stepID }

// TraceID returns the parent trace's identifier.
func (s *StepHandle) TraceID() string { return s.traceID }

// IsClosed reports whether the step has been finished or failed.
func (s *StepHandle) IsClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

func (s *StepHandle) markClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		s.logger.Warn("Step %s already closed", s.stepID)
		return false
	}
	s.closed = true
	return true
}

// Finish completes the step successfully.
func (s *StepHandle) Finish(ctx context.Context, opts FinishStepOptions) error {
	if !s.markClosed() {
		return nil
	}
	return s.emit(ctx, newTraceEvent(EventStepFinished, s.traceID, s.source, map[string]any{
		"output":   opts.Output,
		"metadata": opts.Metadata,
	}, s.stepID))
}

// Fail marks the step as failed.
func (s *StepHandle) Fail(ctx context.Context, err error, opts FailStepOptions) error {
	if !s.markClosed() {
		return nil
	}
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	return s.emit(ctx, newTraceEvent(EventStepFailed, s.traceID, s.source, map[string]any{
		"error":    msg,
		"output":   opts.Output,
		"metadata": opts.Metadata,
	}, s.stepID))
}

// Log emits a log line associated with this step.
func (s *StepHandle) Log(ctx context.Context, message string, opts LogOptions) error {
	level := opts.Level
	if level == "" {
		level = LogInfo
	}
	return s.emit(ctx, newTraceEvent(EventLogEmitted, s.traceID, s.source, map[string]any{
		"message":    message,
		"level":      level,
		"event_type": opts.EventType,
		"details":    opts.Details,
	}, s.stepID))
}

// stringError adapts a reason string to the error interface for step failures.
type stringError string

func (e stringError) Error() string { return string(e) }
