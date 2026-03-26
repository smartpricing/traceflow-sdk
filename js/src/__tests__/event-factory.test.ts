import { describe, it, expect } from 'vitest';
import { createTraceEvent } from '../event-factory';
import { TraceEventType } from '../types';

describe('createTraceEvent', () => {
  it('should create a valid trace event', () => {
    const event = createTraceEvent(
      TraceEventType.TRACE_STARTED,
      'trace-123',
      'test-service',
      { title: 'Test Trace' }
    );

    expect(event.event_id).toBeDefined();
    expect(event.event_type).toBe(TraceEventType.TRACE_STARTED);
    expect(event.trace_id).toBe('trace-123');
    expect(event.source).toBe('test-service');
    expect(event.payload.title).toBe('Test Trace');
    expect(event.timestamp).toBeDefined();
    expect(event.step_id).toBeUndefined();
  });

  it('should include step_id when provided', () => {
    const event = createTraceEvent(
      TraceEventType.STEP_STARTED,
      'trace-123',
      'test-service',
      { name: 'Step 1' },
      'step-456'
    );

    expect(event.step_id).toBe('step-456');
    expect(event.trace_id).toBe('trace-123');
  });

  it('should generate unique event IDs', () => {
    const event1 = createTraceEvent(TraceEventType.LOG_EMITTED, 't1', 'src', {});
    const event2 = createTraceEvent(TraceEventType.LOG_EMITTED, 't1', 'src', {});

    expect(event1.event_id).not.toBe(event2.event_id);
  });

  it('should generate valid ISO timestamps', () => {
    const event = createTraceEvent(TraceEventType.TRACE_STARTED, 't1', 'src', {});
    const parsed = new Date(event.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });
});
