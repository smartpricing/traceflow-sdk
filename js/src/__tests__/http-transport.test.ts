import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPTransport } from '../transports/http-transport';
import { TraceEventType, TraceEvent } from '../types';
import { Logger } from '../logger';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    event_id: 'evt-1',
    event_type: TraceEventType.TRACE_STARTED,
    trace_id: 'trace-1',
    timestamp: new Date().toISOString(),
    source: 'test',
    payload: { title: 'Test' },
    ...overrides,
  };
}

describe('HTTPTransport', () => {
  let transport: HTTPTransport;
  const logger = new Logger({ enabled: false });

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    transport = new HTTPTransport(
      {
        endpoint: 'http://localhost:3009',
        apiKey: 'test-key',
        maxRetries: 0,
      },
      logger
    );
  });

  describe('send', () => {
    it('should POST trace_started events to /api/v1/traces', async () => {
      await transport.send(createEvent());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/traces');
      expect(options.method).toBe('POST');
      expect(options.headers['X-API-Key']).toBe('test-key');
    });

    it('should PATCH trace_finished events to /api/v1/traces/:id', async () => {
      await transport.send(
        createEvent({ event_type: TraceEventType.TRACE_FINISHED })
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/traces/trace-1');
      expect(options.method).toBe('PATCH');
    });

    it('should POST step_started events to /api/v1/steps', async () => {
      await transport.send(
        createEvent({
          event_type: TraceEventType.STEP_STARTED,
          step_id: 'step-1',
          payload: { name: 'Step 1' },
        })
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/steps');
      expect(options.method).toBe('POST');
    });

    it('should PATCH step_finished events to /api/v1/steps/:traceId/:stepId', async () => {
      await transport.send(
        createEvent({
          event_type: TraceEventType.STEP_FINISHED,
          step_id: 'step-1',
        })
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/steps/trace-1/step-1');
      expect(options.method).toBe('PATCH');
    });

    it('should POST log_emitted events to /api/v1/logs', async () => {
      await transport.send(
        createEvent({
          event_type: TraceEventType.LOG_EMITTED,
          payload: { message: 'Hello', level: 'INFO' },
        })
      );

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/logs');
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const cbTransport = new HTTPTransport(
        {
          endpoint: 'http://localhost:3009',
          maxRetries: 0,
          enableCircuitBreaker: true,
          circuitBreakerThreshold: 2,
          circuitBreakerTimeout: 100,
          silentErrors: true,
        },
        logger
      );

      mockFetch.mockRejectedValue(new Error('HTTP 500: Internal Server Error'));

      // Send events to trigger circuit breaker
      await cbTransport.send(createEvent());
      await cbTransport.send(createEvent());

      // Circuit should now be open, this should be queued
      mockFetch.mockClear();
      await cbTransport.send(createEvent());

      // No fetch call since circuit is open
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should close circuit after timeout', async () => {
      const cbTransport = new HTTPTransport(
        {
          endpoint: 'http://localhost:3009',
          maxRetries: 0,
          enableCircuitBreaker: true,
          circuitBreakerThreshold: 1,
          circuitBreakerTimeout: 50,
          silentErrors: true,
        },
        logger
      );

      mockFetch.mockRejectedValueOnce(new Error('HTTP 500: Error'));
      await cbTransport.send(createEvent()); // triggers circuit open

      // Wait for circuit to close
      await new Promise(resolve => setTimeout(resolve, 60));

      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      await cbTransport.send(createEvent());

      // Should have made a request after circuit closed
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should queue events when circuit is open and drain on close', async () => {
      const cbTransport = new HTTPTransport(
        {
          endpoint: 'http://localhost:3009',
          maxRetries: 0,
          enableCircuitBreaker: true,
          circuitBreakerThreshold: 1,
          circuitBreakerTimeout: 50,
          silentErrors: true,
        },
        logger
      );

      mockFetch.mockRejectedValueOnce(new Error('HTTP 500: Error'));
      await cbTransport.send(createEvent()); // triggers circuit open

      // Queue events while circuit is open
      mockFetch.mockClear();
      await cbTransport.send(createEvent({ trace_id: 'queued-1' }));
      await cbTransport.send(createEvent({ trace_id: 'queued-2' }));
      expect(mockFetch).not.toHaveBeenCalled();

      // Wait for circuit to close
      await new Promise(resolve => setTimeout(resolve, 60));

      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      await cbTransport.send(createEvent({ trace_id: 'after-close' }));

      // Should have drained queued events + sent the new one
      // Draining is fire-and-forget, wait a tick
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('healthCheck', () => {
    it('should return ok: true when healthy', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await transport.healthCheck();
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/health');
    });

    it('should return ok: false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connection refused'));

      const result = await transport.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('connection refused');
    });

    it('should return ok: false on non-200 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await transport.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('500');
    });
  });

  describe('auth headers', () => {
    it('should include API key header', async () => {
      await transport.send(createEvent());

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['X-API-Key']).toBe('test-key');
    });

    it('should use basic auth when username/password provided', async () => {
      const authTransport = new HTTPTransport(
        {
          endpoint: 'http://localhost:3009',
          username: 'user',
          password: 'pass',
          maxRetries: 0,
        },
        logger
      );

      await authTransport.send(createEvent());

      const headers = mockFetch.mock.calls[0][1].headers;
      const expected = Buffer.from('user:pass').toString('base64');
      expect(headers['Authorization']).toBe(`Basic ${expected}`);
    });
  });

  describe('flush', () => {
    it('should not fail when nothing to flush', async () => {
      await expect(transport.flush()).resolves.toBeUndefined();
    });
  });
});
