package traceflow

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestCircuitBreakerOpensAndQueues(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusInternalServerError) // always fail -> retryable 5xx
	}))
	defer srv.Close()

	tr := newHTTPTransport(httpTransportConfig{
		Endpoint:                srv.URL,
		MaxRetries:              0, // no retries: one failure per send
		EnableCircuitBreaker:    true,
		CircuitBreakerThreshold: 3,
		CircuitBreakerTimeout:   50 * time.Millisecond,
		SilentErrors:            true,
	}, noopLogger{})

	ctx := context.Background()
	ev := func() TraceEvent {
		return newTraceEvent(EventLogEmitted, newUUID(), "s", map[string]any{"message": "x", "level": LogInfo}, "")
	}

	// 3 failures trip the breaker.
	for i := 0; i < 3; i++ {
		if err := tr.Send(ctx, ev()); err != nil {
			t.Fatalf("silent send should not error: %v", err)
		}
	}
	if !tr.isCircuitOpen() {
		t.Fatal("expected circuit open after threshold failures")
	}
	before := atomic.LoadInt32(&calls)

	// While open, events are queued, not sent.
	_ = tr.Send(ctx, ev())
	if atomic.LoadInt32(&calls) != before {
		t.Fatal("expected no HTTP call while circuit open")
	}
	tr.mu.Lock()
	pending := len(tr.pendingEvents)
	tr.mu.Unlock()
	if pending == 0 {
		t.Fatal("expected event queued while circuit open")
	}

	// After the timeout, the circuit half-opens and drains pending events.
	time.Sleep(70 * time.Millisecond)
	if tr.isCircuitOpen() {
		t.Fatal("expected circuit to close after timeout")
	}
}

func TestCircuitBreakerDisabled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	tr := newHTTPTransport(httpTransportConfig{
		Endpoint:             srv.URL,
		MaxRetries:           0,
		EnableCircuitBreaker: false,
		SilentErrors:         true,
	}, noopLogger{})

	ctx := context.Background()
	for i := 0; i < 10; i++ {
		_ = tr.Send(ctx, newTraceEvent(EventTraceStarted, newUUID(), "s", map[string]any{}, ""))
	}
	if tr.isCircuitOpen() {
		t.Fatal("circuit should never open when disabled")
	}
}
