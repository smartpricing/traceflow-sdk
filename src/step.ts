import {
  TraceFlowKafkaStepMessage,
  TraceFlowStepStatus,
  UpdateStepOptions,
  CreateLogOptions,
  TraceFlowLogLevel,
  TraceFlowKafkaLogMessage,
} from './types';
import { TraceFlowRedisClient } from './redis-client';

/**
 * Step - Represents a single step in a trace
 * Provides methods to manage the step's lifecycle
 * 
 * Can be used for both new steps and existing steps (for updates from other processes)
 */
export class Step {
  private traceId: string;
  private stepNumber: number;
  private source?: string;
  private closed: boolean = false;
  private redisClient?: TraceFlowRedisClient;
  private sendMessage: (
    type: 'trace' | 'step' | 'log',
    data: any
  ) => Promise<void>;

  /**
   * Create a Step instance
   * 
   * @param traceId - The trace ID
   * @param stepNumber - The step number
   * @param source - Optional source identifier
   * @param sendMessage - Function to send Kafka messages
   * @param isExisting - If true, this is an existing step (don't track as new)
   * @param redisClient - Optional Redis client for state persistence
   */
  constructor(
    traceId: string,
    stepNumber: number,
    source: string | undefined,
    sendMessage: (type: 'trace' | 'step' | 'log', data: any) => Promise<void>,
    isExisting: boolean = false,
    redisClient?: TraceFlowRedisClient
  ) {
    this.traceId = traceId;
    this.stepNumber = stepNumber;
    this.source = source;
    this.sendMessage = sendMessage;
    this.redisClient = redisClient;
    // If this is an existing step being retrieved, we don't know if it's closed
    // User should be careful when using getStep() on existing steps
    this.closed = false;
  }

  /**
   * Check if step is closed by querying Redis (if available)
   * Falls back to in-memory state if Redis is not configured
   */
  async isClosedFromRedis(): Promise<boolean> {
    if (!this.redisClient) {
      return this.closed;
    }

    try {
      return await this.redisClient.isStepClosed(this.traceId, this.stepNumber);
    } catch (error) {
      console.warn('Failed to check step state from Redis, using in-memory state:', error);
      return this.closed;
    }
  }

  /**
   * Get the step number
   */
  getStepNumber(): number {
    return this.stepNumber;
  }

  /**
   * Check if the step is closed (completed or failed)
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Update the step
   */
  async update(options: UpdateStepOptions = {}): Promise<void> {
    if (this.closed) {
      throw new Error(`Step ${this.stepNumber} is already closed`);
    }

    console.log(`[Step ${this.traceId}:${this.stepNumber}] Updating step (status: ${options.status || 'unchanged'})`);

    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      trace_id: this.traceId,
      step_number: this.stepNumber,
      updated_at: now,
      last_activity_at: now,
      ...options,
      // Convert Date to string if needed
      finished_at: options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at,
    };

    await this.sendMessage('step', data);

    // Persist to Redis if available
    if (this.redisClient) {
      try {
        console.log(`[Step ${this.traceId}:${this.stepNumber}] Persisting step update to Redis...`);
        // Get current state and merge with updates
        const existingState = await this.redisClient.getStep(this.traceId, this.stepNumber);
        if (existingState) {
          await this.redisClient.saveStep({
            ...existingState,
            step_id: options.step_id || existingState.step_id,
            step_type: options.step_type || existingState.step_type,
            name: options.name || existingState.name,
            status: (options.status as TraceFlowStepStatus) || existingState.status,
            updated_at: now,
            finished_at: (options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at) || existingState.finished_at,
            output: options.output || existingState.output,
            error: options.error || existingState.error,
            metadata: options.metadata || existingState.metadata,
            last_activity_at: now,
          });
        }
      } catch (error) {
        console.error(`[Step ${this.traceId}:${this.stepNumber}] ❌ Failed to persist step state to Redis:`, error);
      }
    }

    console.log(`[Step ${this.traceId}:${this.stepNumber}] ✅ Step updated successfully`);
  }

  /**
   * Complete the step successfully
   */
  async complete(output?: any): Promise<void> {
    if (this.closed) {
      throw new Error(`Step ${this.stepNumber} is already closed`);
    }

    console.log(`[Step ${this.traceId}:${this.stepNumber}] Completing step...`);

    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      trace_id: this.traceId,
      step_number: this.stepNumber,
      status: TraceFlowStepStatus.COMPLETED,
      finished_at: now,
      updated_at: now,
      last_activity_at: now,
      ...(output !== undefined && { output }),
    };

    await this.sendMessage('step', data);
    this.closed = true;

    // Persist to Redis if available
    if (this.redisClient) {
      try {
        const existingState = await this.redisClient.getStep(this.traceId, this.stepNumber);
        if (existingState) {
          await this.redisClient.saveStep({
            ...existingState,
            status: TraceFlowStepStatus.COMPLETED,
            finished_at: now,
            updated_at: now,
            last_activity_at: now,
            ...(output !== undefined && { output }),
          });
        }
      } catch (error) {
        console.error(`[Step ${this.traceId}:${this.stepNumber}] ❌ Failed to persist step state to Redis:`, error);
      }
    }

    console.log(`[Step ${this.traceId}:${this.stepNumber}] ✅ Step completed successfully`);
  }

  /**
   * Finish the step successfully (alias for complete)
   */
  async finish(output?: any): Promise<void> {
    return this.complete(output);
  }

  /**
   * Fail the step
   */
  async fail(error: string): Promise<void> {
    if (this.closed) {
      throw new Error(`Step ${this.stepNumber} is already closed`);
    }

    console.log(`[Step ${this.traceId}:${this.stepNumber}] Failing step with error: ${error}`);

    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      trace_id: this.traceId,
      step_number: this.stepNumber,
      status: TraceFlowStepStatus.FAILED,
      finished_at: now,
      updated_at: now,
      last_activity_at: now,
      error,
    };

    await this.sendMessage('step', data);
    this.closed = true;

    // Persist to Redis if available
    if (this.redisClient) {
      try {
        const existingState = await this.redisClient.getStep(this.traceId, this.stepNumber);
        if (existingState) {
          await this.redisClient.saveStep({
            ...existingState,
            status: TraceFlowStepStatus.FAILED,
            finished_at: now,
            updated_at: now,
            last_activity_at: now,
            error,
          });
        }
      } catch (error) {
        console.warn('Failed to persist step state to Redis:', error);
      }
    }
  }

  /**
   * Add a log to this step
   */
  async log(message: string, level: TraceFlowLogLevel | string = TraceFlowLogLevel.INFO, details?: any): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaLogMessage = {
      trace_id: this.traceId,
      log_time: now,
      step_number: this.stepNumber,
      level,
      event_type: 'message',
      message,
      details: details ? JSON.stringify(details) : undefined,
      source: this.source,
    };

    await this.sendMessage('log', data);
  }

  /**
   * Log at INFO level
   */
  async info(message: string, details?: any): Promise<void> {
    await this.log(message, TraceFlowLogLevel.INFO, details);
  }

  /**
   * Log at WARN level
   */
  async warn(message: string, details?: any): Promise<void> {
    await this.log(message, TraceFlowLogLevel.WARN, details);
  }

  /**
   * Log at ERROR level
   */
  async error(message: string, details?: any): Promise<void> {
    await this.log(message, TraceFlowLogLevel.ERROR, details);
  }

  /**
   * Log at DEBUG level
   */
  async debug(message: string, details?: any): Promise<void> {
    await this.log(message, TraceFlowLogLevel.DEBUG, details);
  }
}

