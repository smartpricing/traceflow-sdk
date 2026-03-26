import { describe, it, expect } from 'vitest';
import { ContextManager } from '../context-manager';

describe('ContextManager', () => {
  it('should return undefined when no context is set', () => {
    const cm = new ContextManager();
    expect(cm.getCurrentContext()).toBeUndefined();
    expect(cm.getCurrentTraceId()).toBeUndefined();
    expect(cm.getCurrentStepId()).toBeUndefined();
  });

  it('should run function with context', async () => {
    const cm = new ContextManager();
    const context = { trace_id: 'trace-1' };

    const result = await cm.runWithContext(context, async () => {
      expect(cm.getCurrentContext()).toEqual(context);
      expect(cm.getCurrentTraceId()).toBe('trace-1');
      return 'result';
    });

    expect(result).toBe('result');
  });

  it('should update context within a run', async () => {
    const cm = new ContextManager();

    await cm.runWithContext({ trace_id: 'trace-1' }, async () => {
      cm.updateContext({ step_id: 'step-1' });
      expect(cm.getCurrentStepId()).toBe('step-1');
      expect(cm.getCurrentTraceId()).toBe('trace-1');
    });
  });

  it('should isolate contexts across async boundaries', async () => {
    const cm = new ContextManager();

    const promise1 = cm.runWithContext({ trace_id: 'trace-1' }, async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(cm.getCurrentTraceId()).toBe('trace-1');
    });

    const promise2 = cm.runWithContext({ trace_id: 'trace-2' }, async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(cm.getCurrentTraceId()).toBe('trace-2');
    });

    await Promise.all([promise1, promise2]);
  });

  it('should not update context when no store exists', () => {
    const cm = new ContextManager();
    // Should not throw
    cm.updateContext({ step_id: 'step-1' });
    expect(cm.getCurrentContext()).toBeUndefined();
  });

  it('should set context within a run', async () => {
    const cm = new ContextManager();

    await cm.runWithContext({ trace_id: 'trace-1' }, async () => {
      cm.setContext({ trace_id: 'trace-2', metadata: { key: 'value' } });
      expect(cm.getCurrentTraceId()).toBe('trace-2');
      expect(cm.getCurrentContext()?.metadata).toEqual({ key: 'value' });
    });
  });
});
