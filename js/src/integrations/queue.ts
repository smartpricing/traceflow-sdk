/**
 * Queue/Job Context Propagation Helpers
 *
 * Serialize and restore trace context across job queues (BullMQ, etc.).
 * Equivalent to PHP SDK's TracedJob trait + RestoreTraceContext middleware.
 */

import { TraceFlowSDK } from '../sdk';
import { TraceHandle } from '../types';

/**
 * Serialized trace context to embed in job data
 */
export interface SerializedTraceContext {
  traceId: string;
  stepId?: string;
  metadata?: Record<string, any>;
}

/**
 * Serialize the current trace context for embedding in job payloads.
 *
 * @example
 * ```typescript
 * // When dispatching a job
 * const ctx = serializeTraceContext(sdk);
 * await queue.add('process', { ...jobData, _traceContext: ctx });
 * ```
 */
export function serializeTraceContext(sdk: TraceFlowSDK): SerializedTraceContext | null {
  const context = sdk.getCurrentContext();
  if (!context?.trace_id) return null;

  return {
    traceId: context.trace_id,
    stepId: context.step_id,
    metadata: context.metadata,
  };
}

/**
 * Restore trace context from serialized data and return a trace handle.
 *
 * @example
 * ```typescript
 * // Inside a job processor
 * const trace = await restoreTraceContext(sdk, jobData._traceContext);
 * if (trace) {
 *   const step = await trace.startStep({ name: 'process-job' });
 *   // ... do work
 *   await step.finish();
 * }
 * ```
 */
export async function restoreTraceContext(
  sdk: TraceFlowSDK,
  ctx: SerializedTraceContext | null | undefined
): Promise<TraceHandle | null> {
  if (!ctx?.traceId) return null;
  return sdk.getTrace(ctx.traceId);
}

/**
 * Options for the traced processor wrapper
 */
export interface TracedProcessorOptions {
  /** Name for the auto-created step (default: 'job-processing') */
  stepName?: string;
  /** Extract trace context from job data (default: job.data._traceContext) */
  extractContext?: (job: any) => SerializedTraceContext | null | undefined;
}

/**
 * Wrap a BullMQ-style processor function with automatic trace context restoration.
 * Creates a step for the job processing and auto-finishes/fails it.
 *
 * @example
 * ```typescript
 * import { Worker } from 'bullmq';
 *
 * const worker = new Worker('my-queue', createTracedProcessor(sdk, async (job, trace) => {
 *   // trace is restored from job.data._traceContext
 *   await trace?.log('Processing job...');
 *   return { processed: true };
 * }));
 * ```
 */
export function createTracedProcessor(
  sdk: TraceFlowSDK,
  processor: (job: any, trace: TraceHandle | null) => Promise<any>,
  options: TracedProcessorOptions = {}
) {
  const stepName = options.stepName || 'job-processing';
  const extractContext = options.extractContext || ((job: any) => job?.data?._traceContext);

  return async (job: any) => {
    const ctx = extractContext(job);
    const trace = await restoreTraceContext(sdk, ctx);

    if (trace) {
      const step = await trace.startStep({
        name: stepName,
        metadata: { jobId: job?.id, jobName: job?.name },
      });

      try {
        const result = await processor(job, trace);
        await step.finish({ output: result });
        return result;
      } catch (error) {
        await step.fail(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    } else {
      return processor(job, null);
    }
  };
}
