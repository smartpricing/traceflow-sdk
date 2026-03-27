import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraceFlowSDK } from '../sdk';
import { createExpressMiddleware } from '../middleware/express';
import { traceflowFastifyPlugin } from '../middleware/fastify';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockReq(overrides: any = {}) {
  return {
    method: 'GET',
    path: '/api/test',
    url: '/api/test',
    originalUrl: '/api/test',
    headers: {},
    ...overrides,
  };
}

function createMockRes() {
  const headers: Record<string, string> = {};
  const listeners: Record<string, Function[]> = {};

  return {
    statusCode: 200,
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    header: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    getHeaders: () => headers,
    on: vi.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    _emit: (event: string) => {
      listeners[event]?.forEach(cb => cb());
    },
  };
}

describe('Express Middleware', () => {
  let sdk: TraceFlowSDK;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    sdk = new TraceFlowSDK({
      transport: 'http',
      source: 'test-api',
      endpoint: 'http://localhost:3009',
      enableLogging: false,
      autoFlushOnExit: false,
    });
  });

  it('should create a trace for incoming requests', async () => {
    const middleware = createExpressMiddleware(sdk);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.traceflowTraceId).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('x-trace-id', expect.any(String));
  });

  it('should extract trace ID from request header', async () => {
    const incomingUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const middleware = createExpressMiddleware(sdk);
    const req = createMockReq({
      headers: { 'x-trace-id': incomingUuid },
    });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.traceflowTraceId).toBe(incomingUuid);
  });

  it('should skip ignored paths', async () => {
    const middleware = createExpressMiddleware(sdk, {
      ignorePaths: ['/health'],
    });
    const req = createMockReq({ path: '/health' });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.traceflowTraceId).toBeUndefined();
  });

  it('should auto-finish trace on response end', async () => {
    const middleware = createExpressMiddleware(sdk);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);
    mockFetch.mockClear();

    // Simulate response finish
    res.statusCode = 200;
    res._emit('finish');

    // Wait for async trace finish
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockFetch).toHaveBeenCalled();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('SUCCESS');
  });

  it('should auto-fail trace on 4xx/5xx response', async () => {
    const middleware = createExpressMiddleware(sdk);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);
    mockFetch.mockClear();

    res.statusCode = 500;
    res._emit('finish');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockFetch).toHaveBeenCalled();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('FAILED');
  });

  it('should support custom header name', async () => {
    const customUuid = '550e8400-e29b-41d4-a716-446655440000';
    const middleware = createExpressMiddleware(sdk, {
      headerName: 'x-request-id',
    });
    const req = createMockReq({
      headers: { 'x-request-id': customUuid },
    });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.traceflowTraceId).toBe(customUuid);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', customUuid);
  });
});

describe('Fastify Plugin', () => {
  let sdk: TraceFlowSDK;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    sdk = new TraceFlowSDK({
      transport: 'http',
      source: 'test-api',
      endpoint: 'http://localhost:3009',
      enableLogging: false,
      autoFlushOnExit: false,
    });
  });

  it('should register hooks with fastify', () => {
    const fastify = {
      addHook: vi.fn(),
    };
    const done = vi.fn();

    traceflowFastifyPlugin(fastify, { sdk }, done);

    expect(fastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    expect(fastify.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
    expect(done).toHaveBeenCalled();
  });

  it('should create trace on request', async () => {
    const hooks: Record<string, Function> = {};
    const fastify = {
      addHook: vi.fn((name: string, handler: Function) => {
        hooks[name] = handler;
      }),
    };
    const done = vi.fn();

    traceflowFastifyPlugin(fastify, { sdk }, done);

    const request = {
      method: 'POST',
      url: '/api/data',
      headers: {},
    };
    const reply = { header: vi.fn() };

    await hooks['onRequest'](request, reply);

    expect(request.traceflowTraceId).toBeDefined();
    expect(reply.header).toHaveBeenCalledWith('x-trace-id', expect.any(String));
  });

  it('should skip ignored paths', async () => {
    const hooks: Record<string, Function> = {};
    const fastify = {
      addHook: vi.fn((name: string, handler: Function) => {
        hooks[name] = handler;
      }),
    };
    const done = vi.fn();

    traceflowFastifyPlugin(fastify, { sdk, ignorePaths: ['/health'] }, done);

    const request: any = { method: 'GET', url: '/health', headers: {} };
    const reply = { header: vi.fn() };

    await hooks['onRequest'](request, reply);

    expect(request.traceflowTraceId).toBeUndefined();
  });
});
