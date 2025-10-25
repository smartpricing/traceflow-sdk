/**
 * TraceFlow SDK Types
 * Types for sending trace tracking messages to Kafka
 */

/**
 * Trace status enum
 */
export enum TraceFlowTraceStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Step status enum
 */
export enum TraceFlowStepStatus {
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Log level enum
 */
export enum TraceFlowLogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Event type enum
 */
export enum TraceFlowEventType {
  STATE_CHANGE = 'state_change',
  OUTPUT = 'output',
  MESSAGE = 'message',
  PROGRESS = 'progress',
}

/**
 * Trace cleaner configuration
 */
export interface TraceFlowCleanerConfig {
  /**
   * Inactivity timeout in seconds - traces inactive longer than this will be closed
   * Default: 1800 seconds (30 minutes)
   */
  inactivityTimeoutSeconds?: number;

  /**
   * Cron interval in seconds - how often to run the cleanup job
   * Default: 300 seconds (5 minutes)
   */
  cleanupIntervalSeconds?: number;

  /**
   * Whether to automatically start the cleaner when client connects
   * Default: true
   */
  autoStart?: boolean;

  /**
   * Custom logger function (optional)
   */
  logger?: (message: string, data?: any) => void;
}

/**
 * Kafka configuration
 */
export interface TraceFlowKafkaConfig {
  brokers: string[];
  topic?: string; // Optional - defaults to 'traceflow'
  clientId?: string;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  ssl?: boolean;
  serviceUrl?: string; // Optional: TraceFlow Service API URL for state recovery
  cleanerConfig?: TraceFlowCleanerConfig; // Optional: Auto-cleanup configuration
}

/**
 * Kafka instance configuration - use existing Kafka or Producer instance
 */
export interface TraceFlowKafkaInstanceConfig {
  topic?: string; // Optional - defaults to 'traceflow'
  kafka?: any; // Kafka instance from @confluentinc/kafka-javascript
  producer?: any; // Producer instance from @confluentinc/kafka-javascript
  serviceUrl?: string; // Optional: TraceFlow Service API URL for state recovery
  cleanerConfig?: TraceFlowCleanerConfig; // Optional: Auto-cleanup configuration
}

/**
 * Combined configuration type - either config or instance
 */
export type TraceFlowConfig = TraceFlowKafkaConfig | TraceFlowKafkaInstanceConfig;

/**
 * Trace creation options
 */
export interface CreateTraceOptions {
  trace_type?: string;
  status?: TraceFlowTraceStatus | string;
  source?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  params?: any;
}

/**
 * Trace options for managing trace behavior
 */
export interface TraceOptions {
  /**
   * Automatically close (complete) the previous step when a new step is created
   * Default: false
   */
  autoCloseSteps?: boolean;
}

/**
 * Trace update options
 */
export interface UpdateTraceOptions {
  trace_type?: string;
  status?: TraceFlowTraceStatus | string;
  source?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  params?: any;
  result?: any;
  error?: string;
  started_at?: Date | string;
  finished_at?: Date | string;
}

/**
 * Step creation options
 */
export interface CreateStepOptions {
  step_number?: number; // If not provided, will be auto-incremented
  step_id?: string;
  step_type?: string;
  name?: string;
  status?: TraceFlowStepStatus | string;
  input?: any;
  metadata?: Record<string, string>;
}

/**
 * Step update options
 */
export interface UpdateStepOptions {
  step_id?: string;
  step_type?: string;
  name?: string;
  status?: TraceFlowStepStatus | string;
  output?: any;
  error?: string;
  finished_at?: Date | string;
  metadata?: Record<string, string>;
}

/**
 * Log creation options
 */
export interface CreateLogOptions {
  step_number?: number;
  level?: TraceFlowLogLevel | string;
  event_type?: TraceFlowEventType | string;
  message?: string;
  details?: any;
  source?: string;
}

/**
 * Internal Kafka message payload for traces
 */
export interface TraceFlowKafkaTraceMessage {
  trace_id: string;
  trace_type?: string;
  status?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  finished_at?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  params?: any;
  result?: any;
  error?: string;
}

/**
 * Internal Kafka message payload for steps
 */
export interface TraceFlowKafkaStepMessage {
  trace_id: string;
  step_number: number;
  step_id?: string;
  step_type?: string;
  name?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
  updated_at?: string;
  input?: any;
  output?: any;
  error?: string;
  metadata?: Record<string, string>;
}

/**
 * Internal Kafka message payload for logs
 */
export interface TraceFlowKafkaLogMessage {
  trace_id: string;
  log_time?: string;
  log_id?: string;
  step_number?: number;
  level?: string;
  event_type?: string;
  message?: string;
  details?: any;
  source?: string;
}

/**
 * Combined Kafka message
 */
export interface TraceFlowKafkaMessage {
  type: 'trace' | 'step' | 'log';
  data: TraceFlowKafkaTraceMessage | TraceFlowKafkaStepMessage | TraceFlowKafkaLogMessage;
}

