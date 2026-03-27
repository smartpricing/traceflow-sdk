import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TraceFlowSDK } from '../sdk';
import { TraceEventType } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('TraceFlowSDK', () => {
  let sdk: TraceFlowSDK;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    sdk = new TraceFlowSDK({
      transport: 'http',
      source: 'test-service',
      endpoint: 'http://localhost:3009',
      enableLogging: false,
      autoFlushOnExit: false,
    });
  });

  describe('startTrace', () => {
    it('should send TRACE_STARTED event', async () => {
      const trace = await sdk.startTrace({ title: 'Test Trace' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/traces');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.title).toBe('Test Trace');
      expect(body.source).toBe('test-service');
      expect(trace.trace_id).toBeDefined();
    });

    it('should use provided trace_id', async () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const trace = await sdk.startTrace({ trace_id: customId, title: 'Test' });
      expect(trace.trace_id).toBe(customId);
    });

    it('should replace invalid trace_id with a valid UUID', async () => {
      const trace = await sdk.startTrace({ trace_id: 'not-a-uuid', title: 'Test' });
      expect(trace.trace_id).not.toBe('not-a-uuid');
      expect(trace.trace_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should include all trace options in payload', async () => {
      await sdk.startTrace({
        title: 'Test',
        description: 'A test trace',
        owner: 'test-user',
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' },
        trace_type: 'api-call',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.title).toBe('Test');
      expect(body.description).toBe('A test trace');
      expect(body.owner).toBe('test-user');
      expect(body.tags).toEqual(['tag1', 'tag2']);
      expect(body.metadata).toEqual({ key: 'value' });
      expect(body.trace_type).toBe('api-call');
    });
  });

  describe('startStep (via trace handle)', () => {
    it('should send STEP_STARTED event', async () => {
      const trace = await sdk.startTrace({ title: 'Test' });
      mockFetch.mockClear();

      const step = await trace.startStep({ name: 'Step 1' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3009/api/v1/steps');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Step 1');
      expect(step.step_id).toBeDefined();
    });
  });

  describe('finish/fail trace', () => {
    it('should send TRACE_FINISHED on finish', async () => {
      const trace = await sdk.startTrace({ title: 'Test' });
      mockFetch.mockClear();

      await trace.finish({ result: { ok: true } });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/traces/');
      expect(options.method).toBe('PATCH');
      const body = JSON.parse(options.body);
      expect(body.status).toBe('SUCCESS');
      expect(body.result).toEqual({ ok: true });
    });

    it('should send TRACE_FAILED on fail', async () => {
      const trace = await sdk.startTrace({ title: 'Test' });
      mockFetch.mockClear();

      await trace.fail(new Error('boom'));

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.status).toBe('FAILED');
      expect(body.error).toBe('boom');
    });

    it('should send TRACE_CANCELLED on cancel', async () => {
      const trace = await sdk.startTrace({ title: 'Test' });
      mockFetch.mockClear();

      await trace.cancel();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.status).toBe('CANCELLED');
    });
  });

  describe('runWithTrace', () => {
    it('should auto-finish trace on success', async () => {
      const result = await sdk.runWithTrace({ title: 'Auto' }, async () => {
        return 'hello';
      });

      expect(result).toBe('hello');
      // Should have sent TRACE_STARTED + TRACE_FINISHED
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should auto-fail trace on error', async () => {
      await expect(
        sdk.runWithTrace({ title: 'Auto' }, async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow('fail');

      // Should have sent TRACE_STARTED + TRACE_FAILED
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('healthCheck', () => {
    it('should return ok when endpoint is reachable', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await sdk.healthCheck();
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return error when endpoint fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await sdk.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('503');
    });

    it('should return error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await sdk.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
    });
  });

  describe('silent errors', () => {
    it('should not throw when silentErrors is true', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const silentSdk = new TraceFlowSDK({
        transport: 'http',
        source: 'test',
        endpoint: 'http://localhost:3009',
        silentErrors: true,
        enableLogging: false,
        autoFlushOnExit: false,
        maxRetries: 0,
      });

      // Should not throw
      const trace = await silentSdk.startTrace({ title: 'Test' });
      expect(trace.trace_id).toBeDefined();
    });

    it('should throw when silentErrors is false', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const throwingSdk = new TraceFlowSDK({
        transport: 'http',
        source: 'test',
        endpoint: 'http://localhost:3009',
        silentErrors: false,
        enableLogging: false,
        autoFlushOnExit: false,
        maxRetries: 0,
      });

      await expect(throwingSdk.startTrace({ title: 'Test' })).rejects.toThrow('Network error');
    });
  });

  describe('getCurrentTrace', () => {
    it('should return null when no trace is active', () => {
      expect(sdk.getCurrentTrace()).toBeNull();
    });
  });

  describe('shutdown lifecycle', () => {
    it('should close unclosed traces on shutdown', async () => {
      const trace = await sdk.startTrace({ title: 'Test' });
      expect(trace.isClosed()).toBe(false);
      mockFetch.mockClear();

      await sdk.shutdown();

      expect(trace.isClosed()).toBe(true);
      // Should have sent TRACE_FAILED for the auto-close
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.status).toBe('FAILED');
    });

    it('should not double-close explicitly finished traces', async () => {
      const trace = await sdk.startTrace({ title: 'Test' });
      await trace.finish();
      expect(trace.isClosed()).toBe(true);
      mockFetch.mockClear();

      await sdk.shutdown();

      // No extra events sent
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('explicitly closed trace is removed from registry', async () => {
      const trace = await sdk.startTrace({ title: 'Test' });
      await trace.finish(); // triggers onClose → removed from activeTraces
      mockFetch.mockClear();

      await sdk.shutdown(); // nothing to close

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should throw when http transport has no endpoint', () => {
      expect(
        () =>
          new TraceFlowSDK({
            transport: 'http',
            source: 'test',
            enableLogging: false,
            autoFlushOnExit: false,
          })
      ).toThrow('endpoint');
    });

    it('should throw when kafka transport has no config', () => {
      expect(
        () =>
          new TraceFlowSDK({
            transport: 'kafka',
            source: 'test',
            enableLogging: false,
            autoFlushOnExit: false,
          })
      ).toThrow('kafka');
    });

    it('should accept circuit breaker config', () => {
      const customSdk = new TraceFlowSDK({
        transport: 'http',
        source: 'test',
        endpoint: 'http://localhost:3009',
        enableLogging: false,
        autoFlushOnExit: false,
        circuitBreakerThreshold: 10,
        circuitBreakerTimeout: 30000,
      });
      expect(customSdk).toBeDefined();
    });
  });
});
