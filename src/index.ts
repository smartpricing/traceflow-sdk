/**
 * TraceFlow SDK
 * SDK for sending trace tracking messages to Kafka
 */

export { TraceFlowClient } from './client';
export { TraceManager } from './trace-manager';
export { Step } from './step';
export { TraceFlowRedisClient } from './redis-client';
export { TraceCleaner } from './trace-cleaner';
export type { TraceState, StepState } from './redis-client';
export type { TraceCleanerConfig } from './trace-cleaner';

// Export error classes
export {
  TraceFlowError,
  TraceClosedError,
  StepClosedError,
  DuplicateError,
  ClientNotInitializedError,
  RedisNotConfiguredError,
  InvalidStateTransitionError,
} from './errors';

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
  TraceFlowTraceStatus,
  TraceFlowStepStatus,
  TraceFlowLogLevel,
  TraceFlowEventType,
} from './types';

export type {
  TraceFlowKafkaConfig,
  TraceFlowKafkaInstanceConfig,
  TraceFlowConfig,
  TraceFlowCleanerConfig,
  CreateTraceOptions,
  UpdateTraceOptions,
  CreateStepOptions,
  UpdateStepOptions,
  CreateLogOptions,
  TraceFlowKafkaTraceMessage,
  TraceFlowKafkaStepMessage,
  TraceFlowKafkaLogMessage,
  TraceFlowKafkaMessage,
} from './types';


