package traceflow

import "context"

// Go's idiomatic replacement for the JS AsyncLocalStorage context manager:
// trace and step IDs ride along on context.Context rather than thread/async
// local storage.

type ctxKey int

const (
	traceIDKey ctxKey = iota
	stepIDKey
)

// ContextWithTrace returns a copy of ctx carrying the given trace ID.
func ContextWithTrace(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, traceIDKey, traceID)
}

// ContextWithStep returns a copy of ctx carrying the given step ID.
func ContextWithStep(ctx context.Context, stepID string) context.Context {
	return context.WithValue(ctx, stepIDKey, stepID)
}

// TraceIDFromContext extracts the active trace ID, if any.
func TraceIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(traceIDKey).(string)
	return id, ok && id != ""
}

// StepIDFromContext extracts the active step ID, if any.
func StepIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(stepIDKey).(string)
	return id, ok && id != ""
}
