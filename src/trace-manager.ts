import { v4 as uuidv4 } from 'uuid';
import {
  TraceFlowTraceStatus,
  TraceFlowStepStatus,
  CreateStepOptions,
  UpdateStepOptions,
  CreateLogOptions,
  TraceOptions,
  TraceFlowKafkaTraceMessage,
  TraceFlowKafkaStepMessage,
  TraceFlowKafkaLogMessage,
  UpdateTraceOptions,
} from './types';
import { Step } from './step';
import { TraceFlowRedisClient } from './redis-client';

/**
 * TraceManager - Manages a specific trace and its steps
 * Provides auto-increment logic for step numbers
 */
export class TraceManager {
  private traceId: string;
  private source?: string;
  private currentStepNumber: number = -1;
  private currentStep?: Step;
  private openSteps: Step[] = []; // Track all open steps
  private traceOptions: TraceOptions;
  private redisClient?: TraceFlowRedisClient; // Optional Redis client for state persistence
  private currentStatus?: TraceFlowTraceStatus; // Track current status to prevent invalid operations
  private sendMessage: (
    type: 'trace' | 'step' | 'log',
    data: TraceFlowKafkaTraceMessage | TraceFlowKafkaStepMessage | TraceFlowKafkaLogMessage
  ) => Promise<void>;

  constructor(
    traceId: string,
    source: string | undefined,
    sendMessage: (
      type: 'trace' | 'step' | 'log',
      data: TraceFlowKafkaTraceMessage | TraceFlowKafkaStepMessage | TraceFlowKafkaLogMessage
    ) => Promise<void>,
    traceOptions?: TraceOptions,
    redisClient?: TraceFlowRedisClient
  ) {
    this.traceId = traceId;
    this.source = source;
    this.sendMessage = sendMessage;
    this.traceOptions = traceOptions || {};
    this.redisClient = redisClient;
    this.currentStatus = TraceFlowTraceStatus.PENDING;
  }

  /**
   * Check if the trace is closed (completed, failed, or cancelled)
   * @returns true if trace is closed
   */
  private isClosed(): boolean {
    const closedStatuses = [TraceFlowTraceStatus.SUCCESS, TraceFlowTraceStatus.FAILED, TraceFlowTraceStatus.CANCELLED];
    return this.currentStatus ? closedStatuses.includes(this.currentStatus) : false;
  }

  /**
   * Validate that operations can be performed on this trace
   * @throws {TraceClosedError} if trace is already closed
   */
  private validateNotClosed(): void {
    if (this.isClosed()) {
      console.log(`[TraceManager ${this.traceId}] ❌ Cannot perform operation - trace is closed with status: ${this.currentStatus}`);
      const { TraceClosedError } = require('./errors');
      throw new TraceClosedError(this.traceId, this.currentStatus!);
    }
  }

  /**
   * Initialize step numbering from Redis (if available)
   * Call this when resuming an existing trace
   */
  async initializeFromRedis(): Promise<void> {
    if (!this.redisClient) {
      console.log(`[TraceManager ${this.traceId}] No Redis client - cannot initialize from Redis`);
      return;
    }

    try {
      console.log(`[TraceManager ${this.traceId}] Initializing step numbering from Redis...`);
      const lastStepNumber = await this.redisClient.getLastStepNumber(this.traceId);
      this.currentStepNumber = lastStepNumber;
      console.log(`[TraceManager ${this.traceId}] ✅ Initialized from Redis (last step: ${lastStepNumber})`);
    } catch (error) {
      console.warn(`[TraceManager ${this.traceId}] ⚠️ Failed to initialize from Redis, using in-memory state:`, error);
    }
  }

  /**
   * Get the trace ID
   */
  getId(): string {
    return this.traceId;
  }

  /**
   * Get an existing step instance by step number
   * Useful for resuming work on a step from another process/instance
   * 
   * @param stepNumber - The step number to retrieve
   * @returns Step instance for the specified step number
   * 
   * @example
   * ```typescript
   * const step = trace.getStep(0);
   * await step.update({ metadata: { progress: '50%' } });
   * await step.finish();
   * ```
   */
  getStep(stepNumber: number): Step {
    const step = new Step(
      this.traceId,
      stepNumber,
      this.source,
      this.sendMessage,
      false,
      this.redisClient // Pass Redis client for state persistence
    );
    return step;
  }

  /**
   * Update the trace
   * @throws {TraceClosedError} if trace is already closed
   */
  async update(options: UpdateTraceOptions): Promise<void> {
    this.validateNotClosed();
    
    const now = new Date().toISOString();

    console.log(`[TraceManager ${this.traceId}] Updating trace (status: ${options.status || 'unchanged'})`);

    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      updated_at: now,
      last_activity_at: now,
      ...options,
      // Convert Date to string if needed
      started_at: options.started_at ? (options.started_at instanceof Date ? options.started_at.toISOString() : options.started_at) : undefined, 
      finished_at: options.finished_at ? (options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at) : undefined,
    };
    await this.sendMessage('trace', data);
    
    // Update current status if provided
    if (options.status) {
      this.currentStatus = options.status as TraceFlowTraceStatus;
    }

    // Persist to Redis if available
    if (this.redisClient) {
      try {
        console.log(`[TraceManager ${this.traceId}] Persisting trace update to Redis...`);
        // Get current state from Redis and merge with updates
        const existingState = await this.redisClient.getTrace(this.traceId);
        const newState = {
          trace_id: this.traceId,
          trace_type: options.trace_type || existingState?.trace_type,
          status: (options.status as TraceFlowTraceStatus) || existingState?.status || TraceFlowTraceStatus.PENDING,
          source: options.source || existingState?.source || this.source,
          created_at: existingState?.created_at || now,
          updated_at: now,
          started_at: (options.started_at ? (options.started_at instanceof Date ? options.started_at.toISOString() : options.started_at) : existingState?.started_at),
          finished_at: (options.finished_at ? (options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at) : existingState?.finished_at),
          title: options.title || existingState?.title,
          description: options.description || existingState?.description,
          owner: options.owner || existingState?.owner,
          tags: options.tags || existingState?.tags,
          metadata: options.metadata || existingState?.metadata,
          params: options.params || existingState?.params,
          result: options.result || existingState?.result,
          error: options.error || existingState?.error,
          last_activity_at: now,
        };
        await this.redisClient.saveTrace(newState);
      } catch (error) {
        console.error(`[TraceManager ${this.traceId}] ❌ Failed to persist trace state to Redis:`, error);
      }
    }

    console.log(`[TraceManager ${this.traceId}] ✅ Trace updated successfully`);
  }

  /**
   * Start the trace (set status to RUNNING)
   * @throws {TraceClosedError} if trace is already closed
   */
  async start(): Promise<void> {
    this.validateNotClosed();
    await this.update({ status: TraceFlowTraceStatus.RUNNING });
  }

  /**
   * Complete the trace successfully
   * Automatically closes all pending steps
   */
  async complete(result?: any): Promise<void> {
    console.log(`[TraceManager ${this.traceId}] Completing trace...`);
    
    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    // Get existing state from Redis to preserve all fields
    let existingState = null;
    if (this.redisClient) {
      try {
        existingState = await this.redisClient.getTrace(this.traceId);
      } catch (error) {
        console.warn(`[TraceManager ${this.traceId}] ⚠️ Could not retrieve existing state from Redis:`, error);
      }
    }

    // Build complete message with all existing fields
    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      status: TraceFlowTraceStatus.SUCCESS,
      updated_at: now,
      finished_at: now,
      // Preserve existing fields if available
      ...(existingState && {
        trace_type: existingState.trace_type,
        source: existingState.source,
        created_at: existingState.created_at,
        started_at: existingState.started_at,
        title: existingState.title,
        description: existingState.description,
        owner: existingState.owner,
        tags: existingState.tags,
        metadata: existingState.metadata,
        params: existingState.params,
      }),
      // Override with new result if provided
      ...(result !== undefined && { result }),
    };

    await this.sendMessage('trace', data);
    this.currentStatus = TraceFlowTraceStatus.SUCCESS;

    // Persist to Redis if available
    if (this.redisClient && existingState) {
      try {
        await this.redisClient.saveTrace({
          ...existingState,
          status: TraceFlowTraceStatus.SUCCESS,
          updated_at: now,
          finished_at: now,
          last_activity_at: now,
          ...(result !== undefined && { result }),
        });
      } catch (error) {
        console.error(`[TraceManager ${this.traceId}] ❌ Failed to persist trace state to Redis:`, error);
      }
    }
    
    console.log(`[TraceManager ${this.traceId}] ✅ Trace completed successfully`);
  }

  /**
   * Finish the trace successfully (alias for complete)
   * Utility method for better readability
   */
  async finish(result?: any): Promise<void> {
    return this.complete(result);
  }

  /**
   * Fail the trace
   * Automatically closes all pending steps
   */
  async fail(error: string): Promise<void> {
    console.log(`[TraceManager ${this.traceId}] Failing trace with error: ${error}`);

    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    // Get existing state from Redis to preserve all fields
    let existingState = null;
    if (this.redisClient) {
      try {
        existingState = await this.redisClient.getTrace(this.traceId);
      } catch (err) {
        console.warn(`[TraceManager ${this.traceId}] ⚠️ Could not retrieve existing state from Redis:`, err);
      }
    }

    // Build complete message with all existing fields
    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      status: TraceFlowTraceStatus.FAILED,
      updated_at: now,
      finished_at: now,
      error,
      // Preserve existing fields if available
      ...(existingState && {
        trace_type: existingState.trace_type,
        source: existingState.source,
        created_at: existingState.created_at,
        started_at: existingState.started_at,
        title: existingState.title,
        description: existingState.description,
        owner: existingState.owner,
        tags: existingState.tags,
        metadata: existingState.metadata,
        params: existingState.params,
        result: existingState.result,
      }),
    };

    await this.sendMessage('trace', data);
    this.currentStatus = TraceFlowTraceStatus.FAILED;

    // Persist to Redis if available
    if (this.redisClient && existingState) {
      try {
        await this.redisClient.saveTrace({
          ...existingState,
          status: TraceFlowTraceStatus.FAILED,
          updated_at: now,
          finished_at: now,
          last_activity_at: now,
          error,
        });
      } catch (err) {
        console.error(`[TraceManager ${this.traceId}] ❌ Failed to persist trace state to Redis:`, err);
      }
    }

    console.log(`[TraceManager ${this.traceId}] ✅ Trace failed successfully`);
  }

  /**
   * Cancel the trace
   * Automatically closes all pending steps
   */
  async cancel(): Promise<void> {
    console.log(`[TraceManager ${this.traceId}] Cancelling trace...`);

    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    // Get existing state from Redis to preserve all fields
    let existingState = null;
    if (this.redisClient) {
      try {
        existingState = await this.redisClient.getTrace(this.traceId);
      } catch (error) {
        console.warn(`[TraceManager ${this.traceId}] ⚠️ Could not retrieve existing state from Redis:`, error);
      }
    }

    // Build complete message with all existing fields
    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      status: TraceFlowTraceStatus.CANCELLED,
      updated_at: now,
      finished_at: now,
      // Preserve existing fields if available
      ...(existingState && {
        trace_type: existingState.trace_type,
        source: existingState.source,
        created_at: existingState.created_at,
        started_at: existingState.started_at,
        title: existingState.title,
        description: existingState.description,
        owner: existingState.owner,
        tags: existingState.tags,
        metadata: existingState.metadata,
        params: existingState.params,
        result: existingState.result,
        error: existingState.error,
      }),
    };

    await this.sendMessage('trace', data);
    this.currentStatus = TraceFlowTraceStatus.CANCELLED;

    // Persist to Redis if available
    if (this.redisClient && existingState) {
      try {
        await this.redisClient.saveTrace({
          ...existingState,
          status: TraceFlowTraceStatus.CANCELLED,
          updated_at: now,
          finished_at: now,
          last_activity_at: now,
        });
      } catch (error) {
        console.error(`[TraceManager ${this.traceId}] ❌ Failed to persist trace state to Redis:`, error);
      }
    }

    console.log(`[TraceManager ${this.traceId}] ✅ Trace cancelled successfully`);
  }

  /**
   * Trace a new step
   * If step_number is not provided, it will be auto-incremented
   * Returns a Step instance for managing the step
   * @throws {TraceClosedError} if trace is already closed
   */
  async step(options: CreateStepOptions = {}): Promise<Step> {
    this.validateNotClosed();
    
    const now = new Date().toISOString();

    console.log(`[TraceManager ${this.traceId}] Creating new step (name: ${options.name || 'unnamed'}, type: ${options.step_type || 'none'})`);

    // Auto-close previous step if option is enabled
    if (this.traceOptions.autoCloseSteps && this.currentStep && !this.currentStep.isClosed()) {
      console.log(`[TraceManager ${this.traceId}] Auto-closing previous step ${this.currentStep.getStepNumber()}`);
      await this.currentStep.complete();
    }

    // Auto-increment step number if not provided
    let stepNumber: number;
    if (options.step_number !== undefined) {
      stepNumber = options.step_number;
      console.log(`[TraceManager ${this.traceId}] Using manual step number: ${stepNumber}`);
      // Update current step number if it's higher
      if (stepNumber > this.currentStepNumber) {
        this.currentStepNumber = stepNumber;
      }
    } else {
      this.currentStepNumber++;
      stepNumber = this.currentStepNumber;
      console.log(`[TraceManager ${this.traceId}] Auto-incremented step number: ${stepNumber}`);
    }

    const data: TraceFlowKafkaStepMessage = {
      trace_id: this.traceId,
      step_number: stepNumber,
      step_id: options.step_id || uuidv4(),
      step_type: options.step_type,
      name: options.name,
      status: options.status || TraceFlowStepStatus.STARTED,
      started_at: now,
      updated_at: now,
      input: options.input,
      metadata: options.metadata,
    };

    await this.sendMessage('step', data);

    // Persist to Redis if available
    if (this.redisClient) {
      try {
        console.log(`[TraceManager ${this.traceId}] Persisting step ${stepNumber} to Redis...`);
        await this.redisClient.saveStep({
          trace_id: this.traceId,
          step_number: stepNumber,
          step_id: data.step_id!,
          step_type: data.step_type,
          name: data.name,
          status: data.status as TraceFlowStepStatus,
          started_at: data.started_at!,
          updated_at: data.updated_at!,
          input: data.input,
          metadata: data.metadata,
          last_activity_at: now,
        });
      } catch (error) {
        console.error(`[TraceManager ${this.traceId}] ❌ Failed to persist step state to Redis:`, error);
      }
    }

    console.log(`[TraceManager ${this.traceId}] ✅ Step ${stepNumber} created successfully`);

    // Create and store the Step instance
    const step = new Step(this.traceId, stepNumber, this.source, this.sendMessage, false, this.redisClient);
    this.currentStep = step;
    
    // Track this step in openSteps
    this.openSteps.push(step);

    return step;
  }

  /**
   * Close all pending steps
   * Called automatically when trace finishes/fails/cancels
   */
  private async closeAllPendingSteps(): Promise<void> {
    // Sort steps by step_number to maintain order (by updated_at flow)
    const pendingSteps = this.openSteps.filter(step => !step.isClosed());
    
    console.log(`[TraceManager ${this.traceId}] Closing ${pendingSteps.length} pending steps...`);
    
    for (const step of pendingSteps) {
      try {
        console.log(`[TraceManager ${this.traceId}] Closing pending step ${step.getStepNumber()}...`);
        await step.complete();
      } catch (error) {
        // Ignore errors for already closed steps
        console.warn(`[TraceManager ${this.traceId}] ⚠️ Failed to close step ${step.getStepNumber()}:`, error);
      }
    }
    
    // Clear the openSteps array
    this.openSteps = [];
    
    console.log(`[TraceManager ${this.traceId}] ✅ All pending steps closed`);
  }

  /**
   * Update an existing step
   */
  async updateStep(stepNumber: number, options: UpdateStepOptions = {}): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      trace_id: this.traceId,
      step_number: stepNumber,
      updated_at: now,
      ...options,
      // Convert Date to string if needed
      finished_at: options.finished_at ? (options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at) : undefined,
    };

    await this.sendMessage('step', data);
  }

  /**
   * Complete a step
   */
  async completeStep(stepNumber: number, output?: any): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      trace_id: this.traceId,
      step_number: stepNumber,
      status: TraceFlowStepStatus.COMPLETED,
      finished_at: now,
      updated_at: now,
      ...(output !== undefined && { output }),
    };

    await this.sendMessage('step', data);
  }

  /**
   * Finish a step (alias for completeStep)
   * Utility method for better readability
   */
  async finishStep(stepNumber: number, output?: any): Promise<void> {
    return this.completeStep(stepNumber, output);
  }

  /**
   * Fail a step
   */
  async failStep(stepNumber: number, error: string): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      trace_id: this.traceId,
      step_number: stepNumber,
      status: TraceFlowStepStatus.FAILED,
      finished_at: now,
      updated_at: now,
      error,
    };

    await this.sendMessage('step', data);
  }

  /**
   * Create a log entry
   * Can be associated with a specific step or just the trace
   */
  async log(options: CreateLogOptions): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaLogMessage = {
      trace_id: this.traceId,
      log_time: now,
      step_number: options.step_number,
      level: options.level,
      event_type: options.event_type,
      message: options.message,
      details: options.details,
      source: options.source || this.source,
    };

    await this.sendMessage('log', data);
  }

  /**
   * Helper method to log at INFO level
   */
  async info(message: string, details?: any, stepNumber?: number): Promise<void> {
    await this.log({
      level: 'INFO',
      event_type: 'message',
      message,
      details,
      step_number: stepNumber,
    });
  }

  /**
   * Helper method to log at WARN level
   */
  async warn(message: string, details?: any, stepNumber?: number): Promise<void> {
    await this.log({
      level: 'WARN',
      event_type: 'message',
      message,
      details,
      step_number: stepNumber,
    });
  }

  /**
   * Helper method to log at ERROR level
   */
  async error(message: string, details?: any, stepNumber?: number): Promise<void> {
    await this.log({
      level: 'ERROR',
      event_type: 'message',
      message,
      details,
      step_number: stepNumber,
    });
  }

  /**
   * Helper method to log at DEBUG level
   */
  async debug(message: string, details?: any, stepNumber?: number): Promise<void> {
    await this.log({
      level: 'DEBUG',
      event_type: 'message',
      message,
      details,
      step_number: stepNumber,
    });
  }
}

