/**
 * TraceFlow SDK Types
 * Types for sending job tracking messages to Kafka
 */

/**
 * Job status enum
 */
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Step status enum
 */
export enum StepStatus {
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Log level enum
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Event type enum
 */
export enum EventType {
  STATE_CHANGE = 'state_change',
  OUTPUT = 'output',
  MESSAGE = 'message',
  PROGRESS = 'progress',
}

/**
 * Kafka configuration
 */
export interface KafkaConfig {
  brokers: string[];
  topic: string;
  clientId?: string;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  ssl?: boolean;
}

/**
 * Kafka instance configuration - use existing Kafka or Producer instance
 */
export interface KafkaInstanceConfig {
  topic: string;
  kafka?: any; // Kafka instance from kafkajs
  producer?: any; // Producer instance from kafkajs
}

/**
 * Combined configuration type - either config or instance
 */
export type TraceFlowConfig = KafkaConfig | KafkaInstanceConfig;

/**
 * Job creation options
 */
export interface CreateJobOptions {
  job_type?: string;
  status?: JobStatus | string;
  source?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  params?: any;
}

/**
 * Job update options
 */
export interface UpdateJobOptions {
  job_type?: string;
  status?: JobStatus | string;
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
  status?: StepStatus | string;
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
  status?: StepStatus | string;
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
  level?: LogLevel | string;
  event_type?: EventType | string;
  message?: string;
  details?: any;
  source?: string;
}

/**
 * Internal Kafka message payload for jobs
 */
export interface KafkaJobMessage {
  job_id: string;
  job_type?: string;
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
export interface KafkaStepMessage {
  job_id: string;
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
export interface KafkaLogMessage {
  job_id: string;
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
export interface KafkaMessage {
  type: 'job' | 'step' | 'log';
  data: KafkaJobMessage | KafkaStepMessage | KafkaLogMessage;
}

