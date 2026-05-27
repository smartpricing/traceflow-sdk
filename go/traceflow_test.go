package traceflow

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func boolPtr(b bool) *bool { return &b }

// recordingTransport captures events for assertions.
type recordingTransport struct {
	mu     sync.Mutex
	events []TraceEvent
}

func (r *recordingTransport) Send(_ context.Context, e TraceEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
	return nil
}
func (r *recordingTransport) Flush(context.Context) error    { return nil }
func (r *recordingTransport) Shutdown(context.Context) error { return nil }
func (r *recordingTransport) HealthCheck(context.Context) HealthCheckResult {
	return HealthCheckResult{OK: true}
}
func (r *recordingTransport) types() []TraceEventType {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]TraceEventType, len(r.events))
	for i, e := range r.events {
		out[i] = e.EventType
	}
	return out
}

func newTestClient(t *testing.T) (*Client, *recordingTransport) {
	t.Helper()
	rec := &recordingTransport{}
	c, err := New(Config{
		Transport:     TransportHTTP,
		Source:        "test-svc",
		Endpoint:      "http://example.invalid",
		EnableLogging: boolPtr(false),
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	c.transport = rec // swap in recorder
	return c, rec
}

func TestNewRequiresSource(t *testing.T) {
	if _, err := New(Config{Transport: TransportHTTP, Endpoint: "http://x"}); err == nil {
		t.Fatal("expected error for missing Source")
	}
}

func TestHTTPTransportRequiresEndpoint(t *testing.T) {
	if _, err := New(Config{Source: "s", Transport: TransportHTTP}); err == nil {
		t.Fatal("expected error for missing Endpoint")
	}
}

func TestStartTraceEmitsStartedEvent(t *testing.T) {
	c, rec := newTestClient(t)
	trace, err := c.StartTrace(context.Background(), StartTraceOptions{Title: "My Process"})
	if err != nil {
		t.Fatalf("StartTrace: %v", err)
	}
	if !IsValidUUID(trace.TraceID()) {
		t.Fatalf("expected generated UUID, got %q", trace.TraceID())
	}
	got := rec.types()
	if len(got) != 1 || got[0] != EventTraceStarted {
		t.Fatalf("expected [trace_started], got %v", got)
	}
	if rec.events[0].Payload["title"] != "My Process" {
		t.Fatalf("title not propagated: %v", rec.events[0].Payload)
	}
}

func TestStartTracePreservesValidID(t *testing.T) {
	c, _ := newTestClient(t)
	id := newUUID()
	trace, _ := c.StartTrace(context.Background(), StartTraceOptions{TraceID: id})
	if trace.TraceID() != id {
		t.Fatalf("expected %s, got %s", id, trace.TraceID())
	}
}

func TestFullTraceStepLifecycle(t *testing.T) {
	c, rec := newTestClient(t)
	ctx := context.Background()
	trace, _ := c.StartTrace(ctx, StartTraceOptions{Title: "p"})
	step, err := trace.StartStep(ctx, StartStepOptions{Name: "s1"})
	if err != nil {
		t.Fatalf("StartStep: %v", err)
	}
	if err := step.Finish(ctx, FinishStepOptions{Output: "done"}); err != nil {
		t.Fatalf("step.Finish: %v", err)
	}
	if err := trace.Finish(ctx, FinishTraceOptions{Result: "ok"}); err != nil {
		t.Fatalf("trace.Finish: %v", err)
	}
	want := []TraceEventType{EventTraceStarted, EventStepStarted, EventStepFinished, EventTraceFinished}
	got := rec.types()
	if len(got) != len(want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("event %d: got %s want %s", i, got[i], want[i])
		}
	}
}

func TestFinishIsIdempotent(t *testing.T) {
	c, rec := newTestClient(t)
	ctx := context.Background()
	trace, _ := c.StartTrace(ctx, StartTraceOptions{})
	_ = trace.Finish(ctx, FinishTraceOptions{})
	_ = trace.Finish(ctx, FinishTraceOptions{})
	if !trace.IsClosed() {
		t.Fatal("expected closed")
	}
	// trace_started + a single trace_finished
	if n := len(rec.types()); n != 2 {
		t.Fatalf("expected 2 events, got %d (%v)", n, rec.types())
	}
}

func TestTraceFinishClosesOrphanedSteps(t *testing.T) {
	c, rec := newTestClient(t)
	ctx := context.Background()
	trace, _ := c.StartTrace(ctx, StartTraceOptions{})
	_, _ = trace.StartStep(ctx, StartStepOptions{Name: "leaked"})
	_ = trace.Finish(ctx, FinishTraceOptions{})

	var stepFailed bool
	for _, et := range rec.types() {
		if et == EventStepFailed {
			stepFailed = true
		}
	}
	if !stepFailed {
		t.Fatalf("expected orphaned step to be failed, got %v", rec.types())
	}
}

func TestWithStepFailsOnError(t *testing.T) {
	c, rec := newTestClient(t)
	ctx := context.Background()
	trace, _ := c.StartTrace(ctx, StartTraceOptions{})
	wantErr := errors.New("boom")
	err := trace.WithStep(ctx, StartStepOptions{Name: "s"}, func(ctx context.Context, step *StepHandle) error {
		if _, ok := TraceIDFromContext(ctx); !ok {
			t.Error("expected trace id in context")
		}
		return wantErr
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected wrapped boom, got %v", err)
	}
	var stepFailed bool
	for _, et := range rec.types() {
		if et == EventStepFailed {
			stepFailed = true
		}
	}
	if !stepFailed {
		t.Fatalf("expected step_failed, got %v", rec.types())
	}
}

func TestRunWithTraceFinishesOnSuccess(t *testing.T) {
	c, rec := newTestClient(t)
	err := c.RunWithTrace(context.Background(), StartTraceOptions{}, func(ctx context.Context, tr *TraceHandle) error {
		return tr.Log(ctx, "hi", LogOptions{})
	})
	if err != nil {
		t.Fatalf("RunWithTrace: %v", err)
	}
	got := rec.types()
	if got[len(got)-1] != EventTraceFinished {
		t.Fatalf("expected last event trace_finished, got %v", got)
	}
}

func TestShutdownAutoClosesActiveTraces(t *testing.T) {
	c, rec := newTestClient(t)
	ctx := context.Background()
	_, _ = c.StartTrace(ctx, StartTraceOptions{})
	if err := c.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	var failed bool
	for _, et := range rec.types() {
		if et == EventTraceFailed {
			failed = true
		}
	}
	if !failed {
		t.Fatalf("expected trace_failed on shutdown, got %v", rec.types())
	}
}

func TestDisabledSDKUsesNullTransport(t *testing.T) {
	c, err := New(Config{
		Source:        "s",
		Transport:     TransportHTTP,
		Enabled:       boolPtr(false),
		EnableLogging: boolPtr(false),
		// Note: no Endpoint — disabled SDK must not require it.
	})
	if err != nil {
		t.Fatalf("New disabled: %v", err)
	}
	if _, ok := c.transport.(NullTransport); !ok {
		t.Fatalf("expected NullTransport, got %T", c.transport)
	}
	// Full surface still works without panicking or erroring.
	ctx := context.Background()
	trace, err := c.StartTrace(ctx, StartTraceOptions{Title: "noop"})
	if err != nil {
		t.Fatalf("StartTrace disabled: %v", err)
	}
	if err := trace.Finish(ctx, FinishTraceOptions{}); err != nil {
		t.Fatalf("Finish disabled: %v", err)
	}
}

// --- HTTP transport integration via httptest ---

func TestHTTPTransportRoutesEndpoints(t *testing.T) {
	var mu sync.Mutex
	hits := map[string]string{} // "METHOD path" -> body

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		hits[r.Method+" "+r.URL.Path] = string(body)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c, err := New(Config{
		Source:        "svc",
		Transport:     TransportHTTP,
		Endpoint:      srv.URL,
		APIKey:        "k",
		EnableLogging: boolPtr(false),
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ctx := context.Background()
	trace, _ := c.StartTrace(ctx, StartTraceOptions{Title: "t"})
	step, _ := trace.StartStep(ctx, StartStepOptions{Name: "s"})
	_ = step.Finish(ctx, FinishStepOptions{Output: "o"})
	_ = trace.Log(ctx, "hello", LogOptions{Level: LogWarn})
	_ = trace.Finish(ctx, FinishTraceOptions{Result: "r"})

	mu.Lock()
	defer mu.Unlock()
	mustHit := []string{
		"POST /api/v1/traces",
		"POST /api/v1/steps",
		"POST /api/v1/logs",
		"PATCH /api/v1/traces/" + trace.TraceID(),
	}
	for _, key := range mustHit {
		if _, ok := hits[key]; !ok {
			t.Fatalf("missing call %q; hits=%v", key, keys(hits))
		}
	}
	// Spot-check the trace POST body carries the source.
	var traceBody map[string]any
	_ = json.Unmarshal([]byte(hits["POST /api/v1/traces"]), &traceBody)
	if traceBody["source"] != "svc" {
		t.Fatalf("expected source svc, got %v", traceBody["source"])
	}
}

func keys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestHTTPHealthCheck(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c, _ := New(Config{Source: "s", Transport: TransportHTTP, Endpoint: srv.URL, EnableLogging: boolPtr(false)})
	res := c.HealthCheck(context.Background())
	if !res.OK {
		t.Fatalf("expected healthy, got %+v", res)
	}
}

func TestSilentErrorsSwallowTransportFailure(t *testing.T) {
	// Endpoint that always 500s; with silent errors (default) Send returns nil.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c, _ := New(Config{
		Source:        "s",
		Transport:     TransportHTTP,
		Endpoint:      srv.URL,
		MaxRetries:    1,
		RetryDelay:    time.Millisecond,
		EnableLogging: boolPtr(false),
	})
	_, err := c.StartTrace(context.Background(), StartTraceOptions{})
	if err != nil {
		t.Fatalf("expected silent success, got %v", err)
	}
}

func TestNonSilentReturnsTransportError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest) // 4xx: not retried
	}))
	defer srv.Close()

	c, _ := New(Config{
		Source:        "s",
		Transport:     TransportHTTP,
		Endpoint:      srv.URL,
		SilentErrors:  boolPtr(false),
		EnableLogging: boolPtr(false),
	})
	if _, err := c.StartTrace(context.Background(), StartTraceOptions{}); err == nil {
		t.Fatal("expected error in non-silent mode")
	}
}
