import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPTransport } from '../transports/http-transport';
import { TraceEventType, TraceEvent } from '../types';
import { Logger } from '../logger';
import { sanitizePayload } from '../transports/sanitize';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    event_id: 'evt-1',
    event_type: TraceEventType.TRACE_STARTED,
    trace_id: 'trace-1',
    timestamp: new Date().toISOString(),
    source: 'test',
    payload: {},
    ...overrides,
  };
}

function getBody(): any {
  const body = mockFetch.mock.calls[0][1].body;
  return JSON.parse(body);
}

describe('sanitizePayload (unit)', () => {
  it('passes scalars through', () => {
    expect(sanitizePayload('hello')).toBe('hello');
    expect(sanitizePayload(42)).toBe(42);
    expect(sanitizePayload(true)).toBe(true);
    expect(sanitizePayload(null)).toBe(null);
    expect(sanitizePayload(undefined)).toBe(undefined);
  });

  it('converts functions to placeholder', () => {
    expect(sanitizePayload(() => {})).toBe('[Function: anonymous]');

    function myFunc() {}
    expect(sanitizePayload(myFunc)).toBe('[Function: myFunc]');
  });

  it('converts BigInt to string', () => {
    expect(sanitizePayload(BigInt(999))).toBe('999');
  });

  it('converts Symbol to string', () => {
    expect(sanitizePayload(Symbol('test'))).toBe('Symbol(test)');
  });

  it('converts Date to ISO string', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(sanitizePayload(d)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('converts RegExp to string', () => {
    expect(sanitizePayload(/test/gi)).toBe('/test/gi');
  });

  it('converts Error to object', () => {
    const err = new Error('boom');
    const result = sanitizePayload(err) as any;
    expect(result.message).toBe('boom');
    expect(result.name).toBe('Error');
  });

  it('converts Map to object', () => {
    const map = new Map([['a', 1], ['b', () => {}]]);
    const result = sanitizePayload(map) as any;
    expect(result.a).toBe(1);
    expect(result.b).toBe('[Function: anonymous]');
  });

  it('converts Set to array', () => {
    const set = new Set([1, 'two', () => {}]);
    const result = sanitizePayload(set) as any[];
    expect(result[0]).toBe(1);
    expect(result[1]).toBe('two');
    expect(result[2]).toBe('[Function: anonymous]');
  });

  it('handles Buffer/Uint8Array', () => {
    const buf = Buffer.from('hello');
    expect(sanitizePayload(buf)).toBe(`[Buffer: ${buf.byteLength} bytes]`);
  });

  it('handles objects with toJSON', () => {
    const obj = { toJSON: () => ({ custom: true }) };
    const result = sanitizePayload(obj) as any;
    expect(result.custom).toBe(true);
  });

  it('detects circular references', () => {
    const a: any = { name: 'a' };
    a.self = a;
    const result = sanitizePayload(a) as any;
    expect(result.name).toBe('a');
    expect(result.self).toBe('[Circular]');
  });

  it('respects max depth', () => {
    let obj: any = { value: 'leaf' };
    for (let i = 0; i < 100; i++) {
      obj = { nested: obj };
    }
    // Should not throw
    const result = sanitizePayload(obj);
    expect(result).toBeDefined();
    // Verify it stopped at some depth
    const json = JSON.stringify(result);
    expect(json).toContain('[max depth reached]');
  });

  it('sanitizes nested functions in arrays and objects', () => {
    const data = {
      items: [1, () => {}, { fn: () => {} }],
      config: { callback: () => {} },
    };
    const result = sanitizePayload(data) as any;
    expect(result.items[0]).toBe(1);
    expect(result.items[1]).toMatch(/^\[Function: /);
    expect(result.items[2].fn).toMatch(/^\[Function: /);
    expect(result.config.callback).toMatch(/^\[Function: /);
  });
});

describe('HTTPTransport payload sanitization (integration)', () => {
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

  it('should not crash when params contains a function', async () => {
    await transport.send(createEvent({
      payload: {
        params: () => 'bad',
      },
    }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = getBody();
    expect(body.params).toMatch(/^\[Function: /);
  });

  it('should not crash when step input contains a function', async () => {
    await transport.send(createEvent({
      event_type: TraceEventType.STEP_STARTED,
      step_id: 'step-1',
      payload: {
        input: { callback: () => {}, data: 'ok' },
      },
    }));

    const body = getBody();
    expect(body.input.callback).toMatch(/^\[Function: /);
    expect(body.input.data).toBe('ok');
  });

  it('should not crash when step output contains a function', async () => {
    await transport.send(createEvent({
      event_type: TraceEventType.STEP_FINISHED,
      step_id: 'step-1',
      payload: {
        output: fn,
      },
    }));

    function fn() { return 'result'; }

    const body = getBody();
    expect(body.output).toBe('[Function: fn]');
  });

  it('should not crash when result contains circular reference', async () => {
    const circular: any = { data: 'value' };
    circular.self = circular;

    await transport.send(createEvent({
      event_type: TraceEventType.TRACE_FINISHED,
      payload: {
        result: circular,
      },
    }));

    const body = getBody();
    expect(body.result.data).toBe('value');
    expect(body.result.self).toBe('[Circular]');
  });

  it('should not crash when details contains BigInt', async () => {
    await transport.send(createEvent({
      event_type: TraceEventType.LOG_EMITTED,
      payload: {
        message: 'test',
        level: 'INFO',
        details: { count: BigInt(42) },
      },
    }));

    const body = getBody();
    expect(body.details.count).toBe('42');
  });

  it('should preserve normal payloads unchanged', async () => {
    await transport.send(createEvent({
      payload: {
        title: 'My Trace',
        params: { key: 'value', num: 123, arr: [1, 2, 3] },
      },
    }));

    const body = getBody();
    expect(body.title).toBe('My Trace');
    expect(body.params).toEqual({ key: 'value', num: 123, arr: [1, 2, 3] });
  });
});
