/**
 * TraceFlow SDK v2 - Core Types
 * Stateless, event-based architecture
 */

// ============================================================================
// EVENT MODEL (Append-Only)
// ============================================================================

/**
 * Core event types emitted by the SDK
 */
export enum TraceEventType {
  TRACE_STARTED = 'trace_started',
  TRACE_FINISHED = 'trace_finished',
  TRACE_FAILED = 'trace_failed',
  TRACE_CANCELLED = 'trace_cancelled',
  STEP_STARTED = 'step_started',
  STEP_FINISHED = 'step_finished',
  STEP_FAILED = 'step_failed',
  LOG_EMITTED = 'log_emitted',
}

/**
 * Base event structure
 */
export interface TraceEvent {
  event_id: string;
  event_type: TraceEventType;
  trace_id: string;
  step_id?: string;
  timestamp: string;
  source: string;
  payload: Record<string, any>;
}

// ============================================================================
// STATUS ENUMS
// ============================================================================

export enum TraceStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum StepStatus {
  STARTED = 'STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

// ============================================================================
// SDK CONFIGURATION
// ============================================================================

export interface KafkaConfig {
  brokers: string[];
  clientId?: string;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string[];
    cert?: string;
    key?: string;
  };
  topic?: string;
}

export interface TraceFlowSDKConfig {
  transport: 'http' | 'kafka';
  source: string;
  
  // HTTP transport options
  endpoint?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number;
  
  // Kafka transport options
  kafka?: KafkaConfig;
  
  // Retry & reliability options
  maxRetries?: number;
  retryDelay?: number;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number; // Number of failures before opening circuit (default: 5)
  circuitBreakerTimeout?: number; // Milliseconds before circuit half-opens (default: 60000)
  
  // Behavior options
  autoFlushOnExit?: boolean;
  flushTimeoutMs?: number;
  silentErrors?: boolean; // Never throw, always swallow errors
  
  // Logging options
  enableLogging?: boolean; // Enable/disable SDK logging (default: true)
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Minimum log level (default: 'info')
  logger?: {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };
}

// ============================================================================
// TRACE OPTIONS
// ============================================================================

export interface StartTraceOptions {
  trace_id?: string;
  trace_type?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  params?: any;
  idempotency_key?: string;
  trace_timeout_ms?: number; // Custom timeout for this trace
  step_timeout_ms?: number; // Custom timeout for steps in this trace
}

export interface FinishTraceOptions {
  result?: any;
  metadata?: Record<string, any>;
}

// ============================================================================
// STEP OPTIONS
// ============================================================================

export interface StartStepOptions {
  step_id?: string;
  name?: string;
  step_type?: string;
  input?: any;
  metadata?: Record<string, any>;
}

export interface FinishStepOptions {
  output?: any;
  metadata?: Record<string, any>;
}

// ============================================================================
// LOG OPTIONS
// ============================================================================

export interface LogOptions {
  step_id?: string;
  level?: LogLevel | string;
  event_type?: string;
  details?: any;
}

// ============================================================================
// TRANSPORT INTERFACE
// ============================================================================

/**
 * Transport abstraction for sending events
 */
export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface TraceTransport {
  /**
   * Send a single event
   */
  send(event: TraceEvent): Promise<void>;

  /**
   * Flush any pending events
   */
  flush?(): Promise<void>;

  /**
   * Shutdown the transport gracefully
   */
  shutdown?(): Promise<void>;

  /**
   * Check connectivity to the backend
   */
  healthCheck?(): Promise<HealthCheckResult>;
}

// ============================================================================
// CONTEXT
// ============================================================================

/**
 * Trace context stored in AsyncLocalStorage
 */
export interface TraceContext {
  trace_id: string;
  step_id?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// HANDLES
// ============================================================================

/**
 * Handle for managing a trace lifecycle
 */
export interface TraceHandle {
  trace_id: string;
  finish(options?: FinishTraceOptions): Promise<void>;
  fail(error: string | Error): Promise<void>;
  cancel(): Promise<void>;
  startStep(options?: StartStepOptions): Promise<StepHandle>;
  log(message: string, options?: LogOptions): Promise<void>;
}

/**
 * Handle for managing a step lifecycle
 */
export interface StepHandle {
  step_id: string;
  trace_id: string;
  finish(options?: FinishStepOptions): Promise<void>;
  fail(error: string | Error): Promise<void>;
  log(message: string, options?: LogOptions): Promise<void>;
}

// ============================================================================
// HTTP API TYPES (matching service schema)
// ============================================================================

export interface HTTPTracePayload {
  trace_id: string;
  trace_type?: string;
  status: TraceStatus;
  source: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  params?: any;
  result?: any;
  error?: string;
  last_activity_at?: string;
  idempotency_key?: string;
  trace_timeout_ms?: number;
  step_timeout_ms?: number;
}

export interface HTTPStepPayload {
  trace_id: string;
  step_number?: number;
  step_id: string;
  step_type?: string;
  name?: string;
  status: StepStatus;
  started_at: string;
  finished_at?: string;
  updated_at: string;
  input?: any;
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface HTTPLogPayload {
  trace_id: string;
  log_time: string;
  log_id: string;
  step_number?: number;
  level: string;
  event_type?: string;
  message: string;
  details?: any;
  source: string;
}

