package traceflow

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"regexp"
	"sync"
	"time"
)

// httpTransportConfig configures the HTTP transport.
type httpTransportConfig struct {
	Endpoint                string
	APIKey                  string
	Username                string
	Password                string
	Timeout                 time.Duration
	MaxRetries              int
	RetryDelay              time.Duration
	EnableCircuitBreaker    bool
	CircuitBreakerThreshold int
	CircuitBreakerTimeout   time.Duration
	SilentErrors            bool
}

var serverErrorRegex = regexp.MustCompile(`HTTP 5\d{2}`)

// httpTransport delivers events to the TraceFlow REST API with exponential
// backoff retries and a circuit breaker. Events arriving while the circuit is
// open are buffered and replayed when it closes.
type httpTransport struct {
	cfg    httpTransportConfig
	client *http.Client
	logger Logger

	mu             sync.Mutex
	circuitOpen    bool
	circuitOpenAt  time.Time
	failureCount   int
	pendingEvents  []TraceEvent
	circuitTimeout time.Duration
	threshold      int
}

func newHTTPTransport(cfg httpTransportConfig, logger Logger) *httpTransport {
	if cfg.Timeout == 0 {
		cfg.Timeout = 5 * time.Second
	}
	// MaxRetries is used verbatim: 0 means no retries. The production default
	// (3) is applied by Client.New so it can be overridden, while callers that
	// construct the transport directly retain full control.
	if cfg.RetryDelay == 0 {
		cfg.RetryDelay = time.Second
	}
	if cfg.CircuitBreakerThreshold == 0 {
		cfg.CircuitBreakerThreshold = 5
	}
	if cfg.CircuitBreakerTimeout == 0 {
		cfg.CircuitBreakerTimeout = 60 * time.Second
	}
	if logger == nil {
		logger = noopLogger{}
	}
	return &httpTransport{
		cfg:            cfg,
		client:         &http.Client{Timeout: cfg.Timeout},
		logger:         logger,
		circuitTimeout: cfg.CircuitBreakerTimeout,
		threshold:      cfg.CircuitBreakerThreshold,
	}
}

func (t *httpTransport) Send(ctx context.Context, event TraceEvent) error {
	if t.isCircuitOpen() {
		t.mu.Lock()
		t.pendingEvents = append(t.pendingEvents, event)
		pending := len(t.pendingEvents)
		t.mu.Unlock()
		t.logger.Warn("Circuit open, queued event: %s (%d pending)", event.EventType, pending)
		if !t.cfg.SilentErrors {
			return fmt.Errorf("circuit breaker is open")
		}
		return nil
	}

	if err := t.sendEventToAPI(ctx, event); err != nil {
		if t.cfg.SilentErrors {
			t.logger.Error("Error sending event (silenced): %v", err)
			return nil
		}
		return err
	}
	return nil
}

func (t *httpTransport) Flush(ctx context.Context) error {
	t.mu.Lock()
	pending := t.pendingEvents
	t.pendingEvents = nil
	t.mu.Unlock()

	if len(pending) > 0 {
		t.logger.Info("Flushing %d circuit-breaker-queued events...", len(pending))
		for _, event := range pending {
			if err := t.sendEventToAPI(ctx, event); err != nil && !t.cfg.SilentErrors {
				t.logger.Error("Failed to flush pending event: %v", err)
			}
		}
	}
	return nil
}

func (t *httpTransport) Shutdown(ctx context.Context) error {
	return t.Flush(ctx)
}

func (t *httpTransport) HealthCheck(ctx context.Context) HealthCheckResult {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, t.cfg.Endpoint+"/api/v1/health", nil)
	if err != nil {
		return HealthCheckResult{OK: false, LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()}
	}
	t.applyAuth(req)
	resp, err := t.client.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return HealthCheckResult{OK: false, LatencyMs: latency, Error: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return HealthCheckResult{OK: false, LatencyMs: latency, Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, resp.Status)}
	}
	return HealthCheckResult{OK: true, LatencyMs: latency}
}

func (t *httpTransport) sendEventToAPI(ctx context.Context, event TraceEvent) error {
	switch event.EventType {
	case EventTraceStarted:
		return t.createTrace(ctx, event)
	case EventTraceFinished, EventTraceFailed, EventTraceCancelled:
		return t.updateTrace(ctx, event)
	case EventStepStarted:
		return t.createStep(ctx, event)
	case EventStepFinished, EventStepFailed:
		return t.updateStep(ctx, event)
	case EventLogEmitted:
		return t.createLog(ctx, event)
	default:
		t.logger.Warn("Unknown event type: %s", event.EventType)
		return nil
	}
}

func (t *httpTransport) createTrace(ctx context.Context, event TraceEvent) error {
	idempotency, _ := event.Payload["idempotency_key"].(string)
	if idempotency == "" {
		idempotency = event.EventID
	}
	payload := httpTracePayload{
		TraceID:        event.TraceID,
		TraceType:      asString(event.Payload["trace_type"]),
		Status:         TraceStatusPending,
		Source:         event.Source,
		CreatedAt:      event.Timestamp,
		UpdatedAt:      event.Timestamp,
		Title:          asString(event.Payload["title"]),
		Description:    asString(event.Payload["description"]),
		Owner:          asString(event.Payload["owner"]),
		Tags:           asStringSlice(event.Payload["tags"]),
		Metadata:       asMap(event.Payload["metadata"]),
		Params:         event.Payload["params"],
		LastActivityAt: event.Timestamp,
		IdempotencyKey: idempotency,
		TraceTimeoutMs: asInt(event.Payload["trace_timeout_ms"]),
		StepTimeoutMs:  asInt(event.Payload["step_timeout_ms"]),
	}
	return t.executeWithRetry(ctx, http.MethodPost, t.cfg.Endpoint+"/api/v1/traces", payload)
}

func (t *httpTransport) updateTrace(ctx context.Context, event TraceEvent) error {
	var status TraceStatus
	switch event.EventType {
	case EventTraceFinished:
		status = TraceStatusSuccess
	case EventTraceFailed:
		status = TraceStatusFailed
	case EventTraceCancelled:
		status = TraceStatusCancelled
	default:
		status = TraceStatusRunning
	}
	payload := httpTracePayload{
		Status:         status,
		UpdatedAt:      event.Timestamp,
		FinishedAt:     event.Timestamp,
		LastActivityAt: event.Timestamp,
		Result:         event.Payload["result"],
		Error:          asString(event.Payload["error"]),
		Metadata:       asMap(event.Payload["metadata"]),
	}
	return t.executeWithRetry(ctx, http.MethodPatch, t.cfg.Endpoint+"/api/v1/traces/"+event.TraceID, payload)
}

func (t *httpTransport) createStep(ctx context.Context, event TraceEvent) error {
	payload := httpStepPayload{
		TraceID:   event.TraceID,
		StepID:    event.StepID,
		StepType:  asString(event.Payload["step_type"]),
		Name:      asString(event.Payload["name"]),
		Status:    StepStatusStarted,
		StartedAt: event.Timestamp,
		UpdatedAt: event.Timestamp,
		Input:     event.Payload["input"],
		Metadata:  asMap(event.Payload["metadata"]),
	}
	return t.executeWithRetry(ctx, http.MethodPost, t.cfg.Endpoint+"/api/v1/steps", payload)
}

func (t *httpTransport) updateStep(ctx context.Context, event TraceEvent) error {
	status := StepStatusFailed
	if event.EventType == EventStepFinished {
		status = StepStatusCompleted
	}
	payload := httpStepPayload{
		Status:     status,
		UpdatedAt:  event.Timestamp,
		FinishedAt: event.Timestamp,
		Output:     event.Payload["output"],
		Error:      asString(event.Payload["error"]),
		Metadata:   asMap(event.Payload["metadata"]),
	}
	url := fmt.Sprintf("%s/api/v1/steps/%s/%s", t.cfg.Endpoint, event.TraceID, event.StepID)
	return t.executeWithRetry(ctx, http.MethodPatch, url, payload)
}

func (t *httpTransport) createLog(ctx context.Context, event TraceEvent) error {
	payload := httpLogPayload{
		TraceID:   event.TraceID,
		LogTime:   event.Timestamp,
		LogID:     event.EventID,
		Level:     asString(event.Payload["level"]),
		EventType: asString(event.Payload["event_type"]),
		Message:   asString(event.Payload["message"]),
		Details:   event.Payload["details"],
		Source:    event.Source,
	}
	return t.executeWithRetry(ctx, http.MethodPost, t.cfg.Endpoint+"/api/v1/logs", payload)
}

func (t *httpTransport) executeWithRetry(ctx context.Context, method, url string, body any) error {
	var lastErr error
	for attempt := 0; ; attempt++ {
		err := t.execute(ctx, method, url, body)
		if err == nil {
			t.mu.Lock()
			t.failureCount = 0
			t.mu.Unlock()
			return nil
		}
		lastErr = err

		if attempt < t.cfg.MaxRetries && (isNetworkError(err) || isServerError(err)) {
			delay := t.backoff(attempt)
			t.logger.Warn("Retry %d/%d after %s", attempt+1, t.cfg.MaxRetries, delay)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
			continue
		}

		t.recordFailure()
		if !t.cfg.SilentErrors {
			return lastErr
		}
		t.logger.Error("Request failed after retries: %v", lastErr)
		return nil
	}
}

func (t *httpTransport) execute(ctx context.Context, method, url string, body any) error {
	data, err := json.Marshal(sanitize(body))
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	t.applyAuth(req)

	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}
	return nil
}

func (t *httpTransport) applyAuth(req *http.Request) {
	switch {
	case t.cfg.APIKey != "":
		req.Header.Set("X-API-Key", t.cfg.APIKey)
	case t.cfg.Username != "" && t.cfg.Password != "":
		auth := base64.StdEncoding.EncodeToString([]byte(t.cfg.Username + ":" + t.cfg.Password))
		req.Header.Set("Authorization", "Basic "+auth)
	}
}

func (t *httpTransport) backoff(attempt int) time.Duration {
	exponential := float64(t.cfg.RetryDelay) * math.Pow(2, float64(attempt))
	jitter := rand.Float64() * float64(time.Second)
	d := time.Duration(exponential + jitter)
	if max := 30 * time.Second; d > max {
		return max
	}
	return d
}

func (t *httpTransport) recordFailure() {
	if !t.cfg.EnableCircuitBreaker {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.failureCount++
	if t.failureCount >= t.threshold {
		t.circuitOpen = true
		t.circuitOpenAt = time.Now().Add(t.circuitTimeout)
		t.logger.Warn("Circuit breaker opened for %s", t.circuitTimeout)
	}
}

func (t *httpTransport) isCircuitOpen() bool {
	if !t.cfg.EnableCircuitBreaker {
		return false
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.circuitOpen && time.Now().After(t.circuitOpenAt) {
		t.logger.Info("Circuit breaker closed, resuming requests")
		t.circuitOpen = false
		t.failureCount = 0
		t.drainLocked()
	}
	return t.circuitOpen
}

// drainLocked replays buffered events asynchronously. Caller holds t.mu.
func (t *httpTransport) drainLocked() {
	if len(t.pendingEvents) == 0 {
		return
	}
	events := t.pendingEvents
	t.pendingEvents = nil
	t.logger.Info("Draining %d pending events after circuit close", len(events))
	for _, event := range events {
		go func(e TraceEvent) {
			if err := t.sendEventToAPI(context.Background(), e); err != nil {
				t.logger.Error("Failed to drain pending event: %v", err)
			}
		}(event)
	}
}

func isNetworkError(err error) bool {
	// http.Client surfaces timeouts, connection refused, DNS failures, and
	// context cancellation as *url.Error wrapping the cause; treat anything
	// that is not an explicit HTTP status error as retryable transport noise.
	return err != nil && !serverErrorRegex.MatchString(err.Error()) && !is4xx(err)
}

func isServerError(err error) bool {
	return err != nil && serverErrorRegex.MatchString(err.Error())
}

func is4xx(err error) bool {
	return err != nil && regexp.MustCompile(`HTTP 4\d{2}`).MatchString(err.Error())
}
