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

// Context manager (for advanced usage)
export { ContextManager } from './context-manager';

