/**
 * Fastify Plugin for automatic request tracing
 *
 * Automatically creates traces for incoming HTTP requests, extracts
 * X-Trace-Id from headers, and propagates trace IDs to responses.
 */

import { TraceFlowSDK } from '../sdk';
import { StartTraceOptions } from '../types';

export interface TraceFlowFastifyOptions {
  /** Extract or generate a trace ID from the request. Defaults to X-Trace-Id header or auto-generated. */
  traceIdExtractor?: (request: any) => string | undefined;
  /** Customize trace options per request */
  getTraceOptions?: (request: any) => Partial<StartTraceOptions>;
  /** Header name for trace ID propagation (default: 'x-trace-id') */
  headerName?: string;
  /** Paths to skip tracing (e.g. health checks) */
  ignorePaths?: string[];
}

/**
 * Creates a Fastify plugin that auto-traces incoming requests.
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { TraceFlowSDK } from '@dev.smartpricing/traceflow-sdk';
 * import { traceflowFastifyPlugin } from '@dev.smartpricing/traceflow-sdk/middleware/fastify';
 *
 * const sdk = new TraceFlowSDK({ transport: 'http', source: 'api', endpoint: '...' });
 * const fastify = Fastify();
 * fastify.register(traceflowFastifyPlugin, { sdk });
 * ```
 */
export function traceflowFastifyPlugin(
  fastify: any,
  opts: TraceFlowFastifyOptions & { sdk: TraceFlowSDK },
  done: (err?: Error) => void
) {
  const { sdk, ...options } = opts;
  const headerName = options.headerName || 'x-trace-id';

  fastify.addHook('onRequest', async (request: any, reply: any) => {
    // Skip ignored paths
    if (options.ignorePaths?.includes(request.url)) {
      return;
    }

    // Extract trace ID from request header or generate new
    const traceId = options.traceIdExtractor
      ? options.traceIdExtractor(request)
      : request.headers?.[headerName];

    const traceOptions: StartTraceOptions = {
      trace_id: traceId || undefined,
      title: `${request.method} ${request.url}`,
      metadata: {
        http_method: request.method,
        http_path: request.url,
      },
      ...options.getTraceOptions?.(request),
    };

    try {
      const trace = await sdk.startTrace(traceOptions);

      // Set trace ID on response header
      reply.header(headerName, trace.trace_id);

      // Attach trace to request for downstream access
      request.traceflowTrace = trace;
      request.traceflowTraceId = trace.trace_id;
    } catch {
      // Don't block the request if tracing fails
    }
  });

  fastify.addHook('onResponse', async (request: any, reply: any) => {
    const trace = request.traceflowTrace;
    if (!trace) return;

    try {
      if (reply.statusCode >= 400) {
        await trace.fail(`HTTP ${reply.statusCode}`);
      } else {
        await trace.finish({
          result: { statusCode: reply.statusCode },
        });
      }
    } catch {
      // Silently ignore errors during auto-finish
    }
  });

  done();
}
