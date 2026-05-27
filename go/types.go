// Package traceflow is a stateless, event-based SDK for distributed tracing
// with TraceFlow. It mirrors the TypeScript, PHP, and Java SDKs while following
// Go idioms: context.Context carries trace/step propagation, and the SDK never
// panics on transport failures when SilentErrors is enabled (the default).
package traceflow

// TraceEventType enumerates the append-only events emitted by the SDK.
type TraceEventType string

const (
	EventTraceStarted   TraceEventType = "trace_started"
	EventTraceFinished  TraceEventType = "trace_finished"
	EventTraceFailed    TraceEventType = "trace_failed"
	EventTraceCancelled TraceEventType = "trace_cancelled"
	EventStepStarted    TraceEventType = "step_started"
	EventStepFinished   TraceEventType = "step_finished"
	EventStepFailed     TraceEventType = "step_failed"
	EventLogEmitted     TraceEventType = "log_emitted"
)

// TraceStatus is the lifecycle status of a trace as stored by the service.
type TraceStatus string

const (
	TraceStatusPending   TraceStatus = "PENDING"
	TraceStatusRunning   TraceStatus = "RUNNING"
	TraceStatusSuccess   TraceStatus = "SUCCESS"
	TraceStatusFailed    TraceStatus = "FAILED"
	TraceStatusCancelled TraceStatus = "CANCELLED"
)

// StepStatus is the lifecycle status of a step as stored by the service.
type StepStatus string

const (
	StepStatusStarted    StepStatus = "STARTED"
	StepStatusInProgress StepStatus = "IN_PROGRESS"
	StepStatusCompleted  StepStatus = "COMPLETED"
	StepStatusFailed     StepStatus = "FAILED"
)

// LogLevel is the severity of an emitted log.
type LogLevel string

const (
	LogDebug LogLevel = "DEBUG"
	LogInfo  LogLevel = "INFO"
	LogWarn  LogLevel = "WARN"
	LogError LogLevel = "ERROR"
	LogFatal LogLevel = "FATAL"
)

// TraceEvent is the base, append-only event flowing through the transport.
type TraceEvent struct {
	EventID   string         `json:"event_id"`
	EventType TraceEventType `json:"event_type"`
	TraceID   string         `json:"trace_id"`
	StepID    string         `json:"step_id,omitempty"`
	Timestamp string         `json:"timestamp"`
	Source    string         `json:"source"`
	Payload   map[string]any `json:"payload"`
}

// StartTraceOptions configures a new trace. All fields are optional; a missing
// or invalid TraceID is replaced with a freshly generated UUID v4.
type StartTraceOptions struct {
	TraceID        string
	TraceType      string
	Title          string
	Description    string
	Owner          string
	Tags           []string
	Metadata       map[string]any
	Params         any
	IdempotencyKey string
	TraceTimeoutMs int
	StepTimeoutMs  int
}

// FinishTraceOptions configures a successful trace completion.
type FinishTraceOptions struct {
	Result   any
	Metadata map[string]any
}

// FailTraceOptions configures a trace failure.
type FailTraceOptions struct {
	Result   any
	Metadata map[string]any
}

// StartStepOptions configures a new step. A missing or invalid StepID is
// replaced with a freshly generated UUID v4.
type StartStepOptions struct {
	StepID   string
	Name     string
	StepType string
	Input    any
	Metadata map[string]any
}

// FinishStepOptions configures a successful step completion.
type FinishStepOptions struct {
	Output   any
	Metadata map[string]any
}

// FailStepOptions configures a step failure.
type FailStepOptions struct {
	Output   any
	Metadata map[string]any
}

// LogOptions configures an emitted log line.
type LogOptions struct {
	StepID    string
	Level     LogLevel
	EventType string
	Details   any
}

// HealthCheckResult reports backend connectivity.
type HealthCheckResult struct {
	OK        bool
	LatencyMs int64
	Error     string
}

// httpTracePayload mirrors the service POST/PATCH /api/v1/traces schema.
type httpTracePayload struct {
	TraceID        string         `json:"trace_id,omitempty"`
	TraceType      string         `json:"trace_type,omitempty"`
	Status         TraceStatus    `json:"status,omitempty"`
	Source         string         `json:"source,omitempty"`
	CreatedAt      string         `json:"created_at,omitempty"`
	UpdatedAt      string         `json:"updated_at,omitempty"`
	StartedAt      string         `json:"started_at,omitempty"`
	FinishedAt     string         `json:"finished_at,omitempty"`
	Title          string         `json:"title,omitempty"`
	Description    string         `json:"description,omitempty"`
	Owner          string         `json:"owner,omitempty"`
	Tags           []string       `json:"tags,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	Params         any            `json:"params,omitempty"`
	Result         any            `json:"result,omitempty"`
	Error          string         `json:"error,omitempty"`
	LastActivityAt string         `json:"last_activity_at,omitempty"`
	IdempotencyKey string         `json:"idempotency_key,omitempty"`
	TraceTimeoutMs int            `json:"trace_timeout_ms,omitempty"`
	StepTimeoutMs  int            `json:"step_timeout_ms,omitempty"`
}

// httpStepPayload mirrors the service POST/PATCH /api/v1/steps schema.
type httpStepPayload struct {
	TraceID    string         `json:"trace_id,omitempty"`
	StepNumber int            `json:"step_number,omitempty"`
	StepID     string         `json:"step_id,omitempty"`
	StepType   string         `json:"step_type,omitempty"`
	Name       string         `json:"name,omitempty"`
	Status     StepStatus     `json:"status,omitempty"`
	StartedAt  string         `json:"started_at,omitempty"`
	FinishedAt string         `json:"finished_at,omitempty"`
	UpdatedAt  string         `json:"updated_at,omitempty"`
	Input      any            `json:"input,omitempty"`
	Output     any            `json:"output,omitempty"`
	Error      string         `json:"error,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// httpLogPayload mirrors the service POST /api/v1/logs schema.
type httpLogPayload struct {
	TraceID    string `json:"trace_id"`
	LogTime    string `json:"log_time"`
	LogID      string `json:"log_id"`
	StepNumber int    `json:"step_number,omitempty"`
	Level      string `json:"level"`
	EventType  string `json:"event_type,omitempty"`
	Message    string `json:"message"`
	Details    any    `json:"details,omitempty"`
	Source     string `json:"source"`
}
