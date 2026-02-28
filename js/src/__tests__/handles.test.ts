import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraceHandleImpl, StepHandleImpl } from '../handles';
import { ContextManager } from '../context-manager';
import { TraceEventType, TraceEvent } from '../types';

describe('TraceHandleImpl', () => {
  let sendEvent: ReturnType<typeof vi.fn>;
  let contextManager: ContextManager;

  beforeEach(() => {
    sendEvent = vi.fn().mockResolvedValue(undefined);
    contextManager = new ContextManager();
  });

  it('should finish trace with TRACE_FINISHED event', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.finish({ result: { ok: true } });

    expect(sendEvent).toHaveBeenCalledTimes(1);
    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.event_type).toBe(TraceEventType.TRACE_FINISHED);
    expect(event.trace_id).toBe('trace-1');
    expect(event.payload.result).toEqual({ ok: true });
  });

  it('should fail trace with TRACE_FAILED event', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.fail(new Error('something went wrong'));

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.event_type).toBe(TraceEventType.TRACE_FAILED);
    expect(event.payload.error).toBe('something went wrong');
    expect(event.payload.stack).toBeDefined();
  });

  it('should fail trace with string error', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.fail('string error');

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.payload.error).toBe('string error');
    expect(event.payload.stack).toBeUndefined();
  });

  it('should cancel trace with TRACE_CANCELLED event', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.cancel();

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.event_type).toBe(TraceEventType.TRACE_CANCELLED);
  });

  it('should be idempotent - not send events after close', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.finish();
    await handle.finish(); // second call should be no-op

    expect(sendEvent).toHaveBeenCalledTimes(1);
  });

  it('should not send fail after finish', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.finish();
    await handle.fail('error');

    expect(sendEvent).toHaveBeenCalledTimes(1);
  });

  it('should start a step with STEP_STARTED event', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);

    await contextManager.runWithContext({ trace_id: 'trace-1' }, async () => {
      const step = await handle.startStep({ name: 'Step 1', step_type: 'processing' });

      const event: TraceEvent = sendEvent.mock.calls[0][0];
      expect(event.event_type).toBe(TraceEventType.STEP_STARTED);
      expect(event.trace_id).toBe('trace-1');
      expect(event.payload.name).toBe('Step 1');
      expect(step.step_id).toBeDefined();
      expect(step.trace_id).toBe('trace-1');
    });
  });

  it('should log with LOG_EMITTED event', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.log('Hello world');

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.event_type).toBe(TraceEventType.LOG_EMITTED);
    expect(event.payload.message).toBe('Hello world');
    expect(event.payload.level).toBe('INFO');
  });

  it('should log with custom level', async () => {
    const handle = new TraceHandleImpl('trace-1', 'test-svc', sendEvent, contextManager);
    await handle.log('Error occurred', { level: 'ERROR' });

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.payload.level).toBe('ERROR');
  });
});

describe('StepHandleImpl', () => {
  let sendEvent: ReturnType<typeof vi.fn>;
  let contextManager: ContextManager;

  beforeEach(() => {
    sendEvent = vi.fn().mockResolvedValue(undefined);
    contextManager = new ContextManager();
  });

  it('should finish step with STEP_FINISHED event', async () => {
    const handle = new StepHandleImpl('step-1', 'trace-1', 'test-svc', sendEvent, contextManager);

    await contextManager.runWithContext({ trace_id: 'trace-1', step_id: 'step-1' }, async () => {
      await handle.finish({ output: { result: 42 } });
    });

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.event_type).toBe(TraceEventType.STEP_FINISHED);
    expect(event.step_id).toBe('step-1');
    expect(event.trace_id).toBe('trace-1');
    expect(event.payload.output).toEqual({ result: 42 });
  });

  it('should fail step with STEP_FAILED event', async () => {
    const handle = new StepHandleImpl('step-1', 'trace-1', 'test-svc', sendEvent, contextManager);

    await contextManager.runWithContext({ trace_id: 'trace-1', step_id: 'step-1' }, async () => {
      await handle.fail(new Error('step failed'));
    });

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.event_type).toBe(TraceEventType.STEP_FAILED);
    expect(event.payload.error).toBe('step failed');
  });

  it('should be idempotent - not send events after close', async () => {
    const handle = new StepHandleImpl('step-1', 'trace-1', 'test-svc', sendEvent, contextManager);

    await contextManager.runWithContext({ trace_id: 'trace-1', step_id: 'step-1' }, async () => {
      await handle.finish();
      await handle.finish();
    });

    expect(sendEvent).toHaveBeenCalledTimes(1);
  });

  it('should log with step_id', async () => {
    const handle = new StepHandleImpl('step-1', 'trace-1', 'test-svc', sendEvent, contextManager);
    await handle.log('step log message');

    const event: TraceEvent = sendEvent.mock.calls[0][0];
    expect(event.event_type).toBe(TraceEventType.LOG_EMITTED);
    expect(event.step_id).toBe('step-1');
    expect(event.payload.message).toBe('step log message');
  });

  it('should clear step_id from context on finish', async () => {
    const handle = new StepHandleImpl('step-1', 'trace-1', 'test-svc', sendEvent, contextManager);

    await contextManager.runWithContext({ trace_id: 'trace-1', step_id: 'step-1' }, async () => {
      expect(contextManager.getCurrentStepId()).toBe('step-1');
      await handle.finish();
      expect(contextManager.getCurrentStepId()).toBeUndefined();
    });
  });
});
