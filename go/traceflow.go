package traceflow

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// TransportKind selects which transport the SDK uses.
type TransportKind string

const (
	TransportHTTP TransportKind = "http"
)

// Config configures a Client. Source is required; sensible defaults are applied
// for everything else.
type Config struct {
	// Transport selects the delivery mechanism. Defaults to TransportHTTP.
	Transport TransportKind
	// Source identifies the emitting service (required).
	Source string

	// Enabled is the master kill switch. When false, the SDK keeps its full
	// public surface but routes every event to a NullTransport — no HTTP, no
	// retries, no required endpoint. Defaults to true.
	Enabled *bool

	// HTTP transport options.
	Endpoint string
	APIKey   string
	Username string
	Password string
	Timeout  time.Duration

	// Reliability options.
	MaxRetries              int
	RetryDelay              time.Duration
	EnableCircuitBreaker    *bool
	CircuitBreakerThreshold int
	CircuitBreakerTimeout   time.Duration

	// Behavior options.
	SilentErrors *bool // never return transport errors; defaults to true.

	// Logging options.
	EnableLogging *bool  // defaults to true.
	LogLevel      string // debug|info|warn|error; defaults to info.
	Logger        Logger // custom logger; overrides the built-in one.

	// HTTPClient overrides the http.Client used for getTrace/heartbeat calls
	// and is injected into the HTTP transport when set.
	HTTPClient *http.Client
}

// Client is the entry point to the TraceFlow SDK.
type Client struct {
	cfg          Config
	source       string
	silentErrors bool
	transport    Transport
	logger       Logger
	httpClient   *http.Client

	mu           sync.Mutex
	activeTraces map[string]*TraceHandle
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

// New creates a Client from cfg. It returns an error only for misconfiguration
// that cannot be recovered from (e.g. HTTP transport without an endpoint while
// enabled).
func New(cfg Config) (*Client, error) {
	if cfg.Source == "" {
		return nil, fmt.Errorf("traceflow: Config.Source is required")
	}
	if cfg.Transport == "" {
		cfg.Transport = TransportHTTP
	}

	silentErrors := boolOr(cfg.SilentErrors, true)
	enabled := boolOr(cfg.Enabled, true)

	var logger Logger = cfg.Logger
	if logger == nil {
		logger = newStdLogger(boolOr(cfg.EnableLogging, true), cfg.LogLevel)
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		timeout := cfg.Timeout
		if timeout == 0 {
			timeout = 5 * time.Second
		}
		httpClient = &http.Client{Timeout: timeout}
	}

	c := &Client{
		cfg:          cfg,
		source:       cfg.Source,
		silentErrors: silentErrors,
		logger:       logger,
		httpClient:   httpClient,
		activeTraces: make(map[string]*TraceHandle),
	}

	logger.Info("Initializing TraceFlow SDK (transport=%s source=%s silentErrors=%v)",
		cfg.Transport, cfg.Source, silentErrors)

	transport, err := c.createTransport(enabled)
	if err != nil {
		return nil, err
	}
	c.transport = transport
	return c, nil
}

func (c *Client) createTransport(enabled bool) (Transport, error) {
	if !enabled {
		c.logger.Info("SDK disabled — using NullTransport (all events will be dropped)")
		return NullTransport{}, nil
	}
	switch c.cfg.Transport {
	case TransportHTTP:
		if c.cfg.Endpoint == "" {
			return nil, fmt.Errorf("traceflow: HTTP transport requires Config.Endpoint")
		}
		var scopedLogger Logger = c.logger
		if sl, ok := c.logger.(*stdLogger); ok {
			scopedLogger = sl.scope("HTTP")
		}
		maxRetries := c.cfg.MaxRetries
		if maxRetries == 0 {
			maxRetries = 3
		}
		t := newHTTPTransport(httpTransportConfig{
			Endpoint:                c.cfg.Endpoint,
			APIKey:                  c.cfg.APIKey,
			Username:                c.cfg.Username,
			Password:                c.cfg.Password,
			Timeout:                 c.cfg.Timeout,
			MaxRetries:              maxRetries,
			RetryDelay:              c.cfg.RetryDelay,
			EnableCircuitBreaker:    boolOr(c.cfg.EnableCircuitBreaker, true),
			CircuitBreakerThreshold: c.cfg.CircuitBreakerThreshold,
			CircuitBreakerTimeout:   c.cfg.CircuitBreakerTimeout,
			SilentErrors:            c.silentErrors,
		}, scopedLogger)
		if c.cfg.HTTPClient != nil {
			t.client = c.cfg.HTTPClient
		}
		return t, nil
	default:
		return nil, fmt.Errorf("traceflow: unknown transport %q", c.cfg.Transport)
	}
}

// sendEvent forwards an event to the transport, honoring SilentErrors.
func (c *Client) sendEvent(ctx context.Context, event TraceEvent) error {
	if err := c.transport.Send(ctx, event); err != nil {
		if c.silentErrors {
			c.logger.Error("Error sending event (silenced): %v", err)
			return nil
		}
		return err
	}
	return nil
}

// StartTrace starts a new trace and returns a handle. The trace is tracked for
// auto-closure on Shutdown. An empty or invalid TraceID is replaced with a new
// UUID v4, making the call idempotent when a valid TraceID is supplied.
func (c *Client) StartTrace(ctx context.Context, opts StartTraceOptions) (*TraceHandle, error) {
	traceID := ensureValidUUID(opts.TraceID, c.logger, "trace_id")

	if err := c.sendEvent(ctx, newTraceEvent(EventTraceStarted, traceID, c.source, map[string]any{
		"trace_type":      opts.TraceType,
		"title":           opts.Title,
		"description":     opts.Description,
		"owner":           opts.Owner,
		"tags":            opts.Tags,
		"metadata":        opts.Metadata,
		"params":          opts.Params,
		"idempotency_key": opts.IdempotencyKey,
		"trace_timeout_ms": func() any {
			if opts.TraceTimeoutMs == 0 {
				return nil
			}
			return opts.TraceTimeoutMs
		}(),
		"step_timeout_ms": func() any {
			if opts.StepTimeoutMs == 0 {
				return nil
			}
			return opts.StepTimeoutMs
		}(),
	}, "")); err != nil {
		return nil, err
	}

	return c.newTraceHandle(traceID, true), nil
}

// RunWithTrace starts a trace, injects it into the context passed to fn, then
// finishes the trace on success or fails it on error. fn's error is propagated.
func (c *Client) RunWithTrace(ctx context.Context, opts StartTraceOptions, fn func(ctx context.Context, trace *TraceHandle) error) error {
	trace, err := c.StartTrace(ctx, opts)
	if err != nil {
		return err
	}
	traceCtx := ContextWithTrace(ctx, trace.traceID)
	if runErr := fn(traceCtx, trace); runErr != nil {
		_ = trace.Fail(ctx, runErr, FailTraceOptions{})
		return runErr
	}
	return trace.Finish(ctx, FinishTraceOptions{})
}

// GetTrace returns a handle for an existing trace, fetching its current state
// from the service (HTTP transport only). In silent mode it returns a handle
// even if the trace cannot be fetched.
func (c *Client) GetTrace(ctx context.Context, traceID string) (*TraceHandle, error) {
	traceID = ensureValidUUID(traceID, c.logger, "trace_id")
	c.logger.Info("Getting trace: %s", traceID)

	if c.cfg.Transport != TransportHTTP || c.cfg.Endpoint == "" {
		c.logger.Warn("GetTrace only supported with HTTP transport, returning stateless handle")
		return c.newTraceHandle(traceID, false), nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/api/v1/traces/%s/state", c.cfg.Endpoint, traceID), nil)
	if err == nil {
		c.applyAuth(req)
		var resp *http.Response
		resp, err = c.httpClient.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusNotFound {
				err = fmt.Errorf("trace not found: %s", traceID)
			} else if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				err = fmt.Errorf("failed to get trace: HTTP %d", resp.StatusCode)
			}
		}
	}

	if err != nil {
		if c.silentErrors {
			c.logger.Error("Error getting trace (silenced): %v", err)
			return c.newTraceHandle(traceID, false), nil
		}
		return nil, err
	}
	c.logger.Info("Retrieved trace %s", traceID)
	return c.newTraceHandle(traceID, false), nil
}

// Heartbeat updates last_activity_at for a trace (HTTP transport only). If
// traceID is empty the active trace from ctx is used.
func (c *Client) Heartbeat(ctx context.Context, traceID string) error {
	if traceID == "" {
		if id, ok := TraceIDFromContext(ctx); ok {
			traceID = id
		}
	} else {
		traceID = ensureValidUUID(traceID, c.logger, "trace_id")
	}
	if traceID == "" {
		c.logger.Warn("No trace ID for heartbeat")
		return nil
	}
	if c.cfg.Transport != TransportHTTP || c.cfg.Endpoint == "" {
		c.logger.Warn("Heartbeat only supported with HTTP transport")
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/api/v1/traces/%s/heartbeat", c.cfg.Endpoint, traceID), nil)
	if err != nil {
		if c.silentErrors {
			return nil
		}
		return err
	}
	c.applyAuth(req)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		if !c.silentErrors {
			return err
		}
		c.logger.Error("Heartbeat error: %v", err)
		return nil
	}
	resp.Body.Close()
	c.logger.Debug("Heartbeat sent for trace: %s", traceID)
	return nil
}

// HealthCheck reports backend connectivity via the transport.
func (c *Client) HealthCheck(ctx context.Context) HealthCheckResult {
	return c.transport.HealthCheck(ctx)
}

// Flush drains any buffered events.
func (c *Client) Flush(ctx context.Context) error {
	return c.transport.Flush(ctx)
}

// Shutdown auto-closes any still-open traces and shuts down the transport.
func (c *Client) Shutdown(ctx context.Context) error {
	c.logger.Info("Shutting down SDK...")
	c.closeAllActive(ctx)
	err := c.transport.Shutdown(ctx)
	c.logger.Info("SDK shutdown complete")
	return err
}

func (c *Client) newTraceHandle(traceID string, owned bool) *TraceHandle {
	h := &TraceHandle{
		traceID: traceID,
		source:  c.source,
		emit:    c.sendEvent,
		logger:  c.logger,
	}
	if owned {
		h.onClose = func() {
			c.mu.Lock()
			delete(c.activeTraces, traceID)
			c.mu.Unlock()
		}
		c.mu.Lock()
		c.activeTraces[traceID] = h
		c.mu.Unlock()
	}
	return h
}

func (c *Client) closeAllActive(ctx context.Context) {
	c.mu.Lock()
	traces := make([]*TraceHandle, 0, len(c.activeTraces))
	for _, h := range c.activeTraces {
		traces = append(traces, h)
	}
	c.activeTraces = make(map[string]*TraceHandle)
	c.mu.Unlock()

	for _, h := range traces {
		if !h.IsClosed() {
			c.logger.Warn("Auto-closing trace %s on shutdown", h.traceID)
			_ = h.Fail(ctx, stringError("Process terminated"), FailTraceOptions{})
		}
	}
}

func (c *Client) applyAuth(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	switch {
	case c.cfg.APIKey != "":
		req.Header.Set("X-API-Key", c.cfg.APIKey)
	case c.cfg.Username != "" && c.cfg.Password != "":
		req.SetBasicAuth(c.cfg.Username, c.cfg.Password)
	}
}
