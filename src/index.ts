/**
 * TraceFlow SDK
 * SDK for sending job tracking messages to Kafka
 */

export { TraceFlowClient } from './client';
export { JobManager } from './job-manager';
export { Step } from './step';

// Re-export singleton methods for convenience
import { TraceFlowClient } from './client';

/**
 * Initialize the TraceFlow singleton
 * @example
 * ```typescript
 * import { initializeTraceFlow } from 'traceflow-sdk';
 * 
 * await initializeTraceFlow({
 *   brokers: ['localhost:9092'],
 *   topic: 'traces',
 * }, 'my-service');
 * ```
 */
export const initializeTraceFlow = TraceFlowClient.initialize.bind(TraceFlowClient);

/**
 * Get the TraceFlow singleton instance
 * @example
 * ```typescript
 * import { getTraceFlow } from 'traceflow-sdk';
 * 
 * const client = getTraceFlow();
 * const trace = await client.trace({ ... });
 * ```
 */
export const getTraceFlow = TraceFlowClient.getInstance.bind(TraceFlowClient);

/**
 * Check if TraceFlow is initialized
 */
export const hasTraceFlow = TraceFlowClient.hasInstance.bind(TraceFlowClient);

/**
 * Reset the TraceFlow singleton (useful for testing)
 */
export const resetTraceFlow = TraceFlowClient.reset.bind(TraceFlowClient);
export {
  TraceFlowJobStatus,
  TraceFlowStepStatus,
  TraceFlowLogLevel,
  TraceFlowEventType,
} from './types';

export type {
  TraceFlowKafkaConfig,
  TraceFlowKafkaInstanceConfig,
  TraceFlowConfig,
  CreateJobOptions,
  UpdateJobOptions,
  CreateStepOptions,
  UpdateStepOptions,
  CreateLogOptions,
  TraceFlowKafkaJobMessage,
  TraceFlowKafkaStepMessage,
  TraceFlowKafkaLogMessage,
  TraceFlowKafkaMessage,
} from './types';

