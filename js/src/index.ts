/**
 * TraceFlow SDK v2 - Exports
 */

// Main SDK
export { TraceFlowSDK } from './sdk';

// Types
export type {
  // Core types
  TraceEvent,
  TraceContext,
  
  // Configuration
  TraceFlowSDKConfig,
  KafkaConfig,
  
  // Options
  StartTraceOptions,
  StartStepOptions,
  FinishTraceOptions,
  FinishStepOptions,
  LogOptions,
  
  // Handles
  TraceHandle,
  StepHandle,
  
  // Transport
  TraceTransport,
  HealthCheckResult,
} from './types';

// Enums
export {
  TraceEventType,
  TraceStatus,
  StepStatus,
  LogLevel,
} from './types';

// Transports (for advanced usage)
export { HTTPTransport } from './transports/http-transport';
export { KafkaTransport } from './transports/kafka-transport';

// Logger (for custom logging)
export { Logger } from './logger';
export type { LoggerConfig, LoggerLike } from './logger';

// Event factory
export { createTraceEvent } from './event-factory';

// Middleware
export { createExpressMiddleware } from './middleware/express';
export type { TraceFlowExpressOptions } from './middleware/express';
export { traceflowFastifyPlugin } from './middleware/fastify';
export type { TraceFlowFastifyOptions } from './middleware/fastify';

// Queue/job context propagation
export { serializeTraceContext, restoreTraceContext, createTracedProcessor } from './integrations/queue';
export type { SerializedTraceContext, TracedProcessorOptions } from './integrations/queue';

// Context manager (for advanced usage)
export { ContextManager } from './context-manager';

