package traceflow

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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

// A 409 Conflict is benign — in distributed tracing the same trace/step can be
// created by more than one service. It must be treated as success: never
// returned as an error and never counted toward the circuit-breaker threshold.
func TestBenignConflictIsNotAFailure(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusConflict) // always 409
	}))
	defer srv.Close()

	tr := newHTTPTransport(httpTransportConfig{
		Endpoint:                srv.URL,
		MaxRetries:              3, // would matter if 409 were retryable
		EnableCircuitBreaker:    true,
		CircuitBreakerThreshold: 3,
		SilentErrors:            false, // surface any error the send might return
	}, noopLogger{})

	ctx := context.Background()
	for i := 0; i < 10; i++ {
		if err := tr.Send(ctx, newTraceEvent(EventTraceStarted, newUUID(), "s", map[string]any{}, "")); err != nil {
			t.Fatalf("409 should be swallowed as success, got error: %v", err)
		}
	}
	if tr.isCircuitOpen() {
		t.Fatal("benign 409s must not trip the circuit breaker")
	}
	tr.mu.Lock()
	failures := tr.failureCount
	tr.mu.Unlock()
	if failures != 0 {
		t.Fatalf("expected 0 recorded failures for 409s, got %d", failures)
	}
	// One call per send: no retries on a 409 (it is not a 5xx / network error).
	if got := atomic.LoadInt32(&calls); got != 10 {
		t.Fatalf("expected 10 calls (no retries on 409), got %d", got)
	}
}

// After the circuit closes, buffered events must be replayed in the order they
// were queued so a step create (POST) always precedes its update (PATCH). A
// racing drain could invert them and 404 the update against a not-yet-created
// step.
func TestDrainReplaysQueuedEventsInOrder(t *testing.T) {
	var mu sync.Mutex
	var order []string
	tripped := false

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if !tripped {
			// First request trips the breaker.
			tripped = true
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		order = append(order, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	tr := newHTTPTransport(httpTransportConfig{
		Endpoint:                srv.URL,
		MaxRetries:              0,
		EnableCircuitBreaker:    true,
		CircuitBreakerThreshold: 1, // one failure opens the circuit
		CircuitBreakerTimeout:   50 * time.Millisecond,
		SilentErrors:            true,
	}, noopLogger{})

	ctx := context.Background()
	traceID := newUUID()
	stepID := newUUID()

	// Trip the breaker with one failing send.
	_ = tr.Send(ctx, newTraceEvent(EventLogEmitted, traceID, "s", map[string]any{"message": "x", "level": LogInfo}, ""))
	if !tr.isCircuitOpen() {
		t.Fatal("expected circuit open after one failure")
	}

	// Queue step create then step update while the circuit is open.
	_ = tr.Send(ctx, newTraceEvent(EventStepStarted, traceID, "s", map[string]any{"name": "work"}, stepID))
	_ = tr.Send(ctx, newTraceEvent(EventStepFinished, traceID, "s", map[string]any{"output": "done"}, stepID))

	// Let the circuit time out, then trigger the close + drain.
	time.Sleep(70 * time.Millisecond)
	if tr.isCircuitOpen() {
		t.Fatal("expected circuit to close after timeout")
	}

	// Wait for the async drain to deliver both queued events.
	deadline := time.Now().Add(2 * time.Second)
	for {
		mu.Lock()
		n := len(order)
		mu.Unlock()
		if n >= 2 || time.Now().After(deadline) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(order) < 2 {
		t.Fatalf("expected 2 drained requests, got %d: %v", len(order), order)
	}
	createIdx, updateIdx := -1, -1
	for i, req := range order {
		if req == http.MethodPost+" /api/v1/steps" {
			createIdx = i
		}
		if strings.HasPrefix(req, http.MethodPatch+" /api/v1/steps/") {
			updateIdx = i
		}
	}
	if createIdx == -1 || updateIdx == -1 {
		t.Fatalf("missing create or update in drained order: %v", order)
	}
	if createIdx > updateIdx {
		t.Fatalf("step create replayed after update (create=%d update=%d): %v", createIdx, updateIdx, order)
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
