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
import { TraceFlowServiceClient } from './service-client';

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
  private serviceClient?: TraceFlowServiceClient; // Optional service client
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
    serviceClient?: TraceFlowServiceClient
  ) {
    this.traceId = traceId;
    this.source = source;
    this.sendMessage = sendMessage;
    this.traceOptions = traceOptions || {};
    this.serviceClient = serviceClient;
  }

  /**
   * Initialize step numbering from service (if available)
   * Call this when resuming an existing trace
   */
  async initializeFromService(): Promise<void> {
    if (!this.serviceClient) {
      return;
    }

    try {
      const lastStepNumber = await this.serviceClient.getLastStepNumber(this.traceId);
      this.currentStepNumber = lastStepNumber;
    } catch (error) {
      console.warn('Failed to initialize from service, using in-memory state:', error);
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
      this.serviceClient // Pass service client for state checking
    );
    return step;
  }

  /**
   * Update the trace
   */
  async update(options: UpdateTraceOptions): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      updated_at: now,
      ...options,
      // Convert Date to string if needed
      started_at: options.started_at ? (options.started_at instanceof Date ? options.started_at.toISOString() : options.started_at) : undefined, 
      finished_at: options.finished_at ? (options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at) : undefined,
    };
    await this.sendMessage('trace', data);
  }

  /**
   * Start the trace (set status to RUNNING)
   */
  async start(): Promise<void> {
    await this.update({ status: TraceFlowTraceStatus.RUNNING });
  }

  /**
   * Complete the trace successfully
   * Automatically closes all pending steps
   */
  async complete(result?: any): Promise<void> {
    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      status: TraceFlowTraceStatus.SUCCESS,
      updated_at: now,
      finished_at: now,
      ...(result !== undefined && { result }),
    };

    await this.sendMessage('trace', data);
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
    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      status: TraceFlowTraceStatus.FAILED,
      updated_at: now,
      finished_at: now,
      error,
    };

    await this.sendMessage('trace', data);
  }

  /**
   * Cancel the trace
   * Automatically closes all pending steps
   */
  async cancel(): Promise<void> {
    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    const data: TraceFlowKafkaTraceMessage = {
      trace_id: this.traceId,
      status: TraceFlowTraceStatus.CANCELLED,
      updated_at: now,
      finished_at: now,
    };

    await this.sendMessage('trace', data);
  }

  /**
   * Trace a new step
   * If step_number is not provided, it will be auto-incremented
   * Returns a Step instance for managing the step
   */
  async step(options: CreateStepOptions = {}): Promise<Step> {
    const now = new Date().toISOString();

    // Auto-close previous step if option is enabled
    if (this.traceOptions.autoCloseSteps && this.currentStep && !this.currentStep.isClosed()) {
      await this.currentStep.complete();
    }

    // Auto-increment step number if not provided
    let stepNumber: number;
    if (options.step_number !== undefined) {
      stepNumber = options.step_number;
      // Update current step number if it's higher
      if (stepNumber > this.currentStepNumber) {
        this.currentStepNumber = stepNumber;
      }
    } else {
      this.currentStepNumber++;
      stepNumber = this.currentStepNumber;
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

    // Create and store the Step instance
    const step = new Step(this.traceId, stepNumber, this.source, this.sendMessage);
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
    
    for (const step of pendingSteps) {
      try {
        await step.complete();
      } catch (error) {
        // Ignore errors for already closed steps
        console.warn(`Failed to close step ${step.getStepNumber()}:`, error);
      }
    }
    
    // Clear the openSteps array
    this.openSteps = [];
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

