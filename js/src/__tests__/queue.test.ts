import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraceFlowSDK } from '../sdk';
import {
  serializeTraceContext,
  restoreTraceContext,
  createTracedProcessor,
} from '../integrations/queue';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Queue Context Propagation', () => {
  let sdk: TraceFlowSDK;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'RUNNING' }) });

    sdk = new TraceFlowSDK({
      transport: 'http',
      source: 'test-service',
      endpoint: 'http://localhost:3009',
      enableLogging: false,
      autoFlushOnExit: false,
    });
  });

  describe('serializeTraceContext', () => {
    it('should return null when no context is active', () => {
      const result = serializeTraceContext(sdk);
      expect(result).toBeNull();
    });
  });

  describe('restoreTraceContext', () => {
    it('should return null for null context', async () => {
      const result = await restoreTraceContext(sdk, null);
      expect(result).toBeNull();
    });

    it('should return null for undefined context', async () => {
      const result = await restoreTraceContext(sdk, undefined);
      expect(result).toBeNull();
    });

    it('should restore trace from serialized context', async () => {
      const trace = await restoreTraceContext(sdk, {
        traceId: 'trace-123',
      });

      expect(trace).not.toBeNull();
      expect(trace!.trace_id).toBe('trace-123');
    });
  });

  describe('createTracedProcessor', () => {
    it('should wrap processor with trace restoration', async () => {
      const processor = vi.fn().mockResolvedValue({ processed: true });
      const wrapped = createTracedProcessor(sdk, processor);

      const job = {
        id: 'job-1',
        name: 'test-job',
        data: {
          _traceContext: { traceId: 'trace-123' },
        },
      };

      await wrapped(job);

      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor.mock.calls[0][0]).toBe(job);
      // Second arg should be the trace handle
      expect(processor.mock.calls[0][1]).not.toBeNull();
      expect(processor.mock.calls[0][1].trace_id).toBe('trace-123');
    });

    it('should call processor with null trace when no context', async () => {
      const processor = vi.fn().mockResolvedValue('ok');
      const wrapped = createTracedProcessor(sdk, processor);

      const job = { id: 'job-1', name: 'test', data: {} };
      await wrapped(job);

      expect(processor).toHaveBeenCalledWith(job, null);
    });

    it('should fail step when processor throws', async () => {
      const processor = vi.fn().mockRejectedValue(new Error('job failed'));
      const wrapped = createTracedProcessor(sdk, processor);

      const job = {
        id: 'job-1',
        name: 'test',
        data: { _traceContext: { traceId: 'trace-123' } },
      };

      await expect(wrapped(job)).rejects.toThrow('job failed');
    });

    it('should use custom step name', async () => {
      const processor = vi.fn().mockResolvedValue('ok');
      const wrapped = createTracedProcessor(sdk, processor, {
        stepName: 'custom-step',
      });

      const job = {
        id: 'job-1',
        name: 'test',
        data: { _traceContext: { traceId: 'trace-123' } },
      };

      await wrapped(job);

      // Verify step was created with custom name
      const stepCall = mockFetch.mock.calls.find(
        (call: any) => call[0].includes('/api/v1/steps') && call[1].method === 'POST'
      );
      expect(stepCall).toBeDefined();
      const body = JSON.parse(stepCall![1].body);
      expect(body.name).toBe('custom-step');
    });

    it('should support custom context extractor', async () => {
      const processor = vi.fn().mockResolvedValue('ok');
      const wrapped = createTracedProcessor(sdk, processor, {
        extractContext: (job: any) => job.data.myContext,
      });

      const job = {
        id: 'job-1',
        name: 'test',
        data: { myContext: { traceId: 'custom-trace' } },
      };

      await wrapped(job);

      expect(processor.mock.calls[0][1]?.trace_id).toBe('custom-trace');
    });
  });
});
