package traceflow

import "context"

// Transport sends trace events to a backend. Implementations should be safe for
// concurrent use by multiple goroutines.
type Transport interface {
	// Send delivers a single event.
	Send(ctx context.Context, event TraceEvent) error
	// Flush drains any buffered events. May be a no-op.
	Flush(ctx context.Context) error
	// Shutdown releases resources, flushing first. May be a no-op.
	Shutdown(ctx context.Context) error
	// HealthCheck reports backend connectivity.
	HealthCheck(ctx context.Context) HealthCheckResult
}

// NullTransport drops every event. It backs the master kill switch
// (Config.Enabled == false): the SDK keeps its full public surface but emits no
// traffic — no HTTP, no retries, no circuit-breaker noise, no required endpoint.
type NullTransport struct{}

func (NullTransport) Send(context.Context, TraceEvent) error { return nil }
func (NullTransport) Flush(context.Context) error            { return nil }
func (NullTransport) Shutdown(context.Context) error         { return nil }
func (NullTransport) HealthCheck(context.Context) HealthCheckResult {
	return HealthCheckResult{OK: true}
}
