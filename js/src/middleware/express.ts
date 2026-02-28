/**
 * Express Middleware for automatic request tracing
 *
 * Automatically creates traces for incoming HTTP requests, extracts
 * X-Trace-Id from headers, and propagates trace IDs to responses.
 */

import { TraceFlowSDK } from '../sdk';
import { StartTraceOptions } from '../types';

export interface TraceFlowExpressOptions {
  /** Extract or generate a trace ID from the request. Defaults to X-Trace-Id header or auto-generated. */
  traceIdExtractor?: (req: any) => string | undefined;
  /** Customize trace options per request */
  getTraceOptions?: (req: any) => Partial<StartTraceOptions>;
  /** Header name for trace ID propagation (default: 'x-trace-id') */
  headerName?: string;
  /** Paths to skip tracing (e.g. health checks) */
  ignorePaths?: string[];
}

/**
 * Creates Express middleware that auto-traces incoming requests.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { TraceFlowSDK } from '@dev.smartpricing/traceflow-sdk';
 * import { createExpressMiddleware } from '@dev.smartpricing/traceflow-sdk/middleware/express';
 *
 * const sdk = new TraceFlowSDK({ transport: 'http', source: 'api', endpoint: '...' });
 * const app = express();
 * app.use(createExpressMiddleware(sdk));
 * ```
 */
export function createExpressMiddleware(
  sdk: TraceFlowSDK,
  options: TraceFlowExpressOptions = {}
) {
  const headerName = options.headerName || 'x-trace-id';

  return async (req: any, res: any, next: any) => {
    // Skip ignored paths
    if (options.ignorePaths?.includes(req.path)) {
      return next();
    }

    // Extract trace ID from request header or generate new
    const traceId = options.traceIdExtractor
      ? options.traceIdExtractor(req)
      : req.headers?.[headerName];

    const traceOptions: StartTraceOptions = {
      trace_id: traceId || undefined,
      title: `${req.method} ${req.path}`,
      metadata: {
        http_method: req.method,
        http_path: req.path,
        http_url: req.originalUrl || req.url,
      },
      ...options.getTraceOptions?.(req),
    };

    try {
      const trace = await sdk.startTrace(traceOptions);

      // Set trace ID on response header
      res.setHeader(headerName, trace.trace_id);

      // Attach trace to request for downstream access
      req.traceflowTrace = trace;
      req.traceflowTraceId = trace.trace_id;

      // Listen for response finish
      res.on('finish', async () => {
        try {
          if (res.statusCode >= 400) {
            await trace.fail(`HTTP ${res.statusCode}`);
          } else {
            await trace.finish({
              result: { statusCode: res.statusCode },
            });
          }
        } catch {
          // Silently ignore errors during auto-finish
        }
      });

      next();
    } catch (error) {
      // Don't block the request if tracing fails
      next();
    }
  };
}
