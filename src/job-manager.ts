import { v4 as uuidv4 } from 'uuid';
import {
  TraceFlowJobStatus,
  TraceFlowStepStatus,
  CreateStepOptions,
  UpdateStepOptions,
  CreateLogOptions,
  TraceOptions,
  TraceFlowKafkaJobMessage,
  TraceFlowKafkaStepMessage,
  TraceFlowKafkaLogMessage,
  UpdateJobOptions,
} from './types';
import { Step } from './step';
import { TraceFlowServiceClient } from './service-client';

/**
 * JobManager - Manages a specific job and its steps
 * Provides auto-increment logic for step numbers
 */
export class JobManager {
  private jobId: string;
  private source?: string;
  private currentStepNumber: number = -1;
  private currentStep?: Step;
  private openSteps: Step[] = []; // Track all open steps
  private traceOptions: TraceOptions;
  private serviceClient?: TraceFlowServiceClient; // Optional service client
  private sendMessage: (
    type: 'job' | 'step' | 'log',
    data: TraceFlowKafkaJobMessage | TraceFlowKafkaStepMessage | TraceFlowKafkaLogMessage
  ) => Promise<void>;

  constructor(
    jobId: string,
    source: string | undefined,
    sendMessage: (
      type: 'job' | 'step' | 'log',
      data: TraceFlowKafkaJobMessage | TraceFlowKafkaStepMessage | TraceFlowKafkaLogMessage
    ) => Promise<void>,
    traceOptions?: TraceOptions,
    serviceClient?: TraceFlowServiceClient
  ) {
    this.jobId = jobId;
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
      const lastStepNumber = await this.serviceClient.getLastStepNumber(this.jobId);
      this.currentStepNumber = lastStepNumber;
    } catch (error) {
      console.warn('Failed to initialize from service, using in-memory state:', error);
    }
  }

  /**
   * Get the trace ID
   */
  getId(): string {
    return this.jobId;
  }

  /**
   * Alias for getId() - for backward compatibility
   * @deprecated Use getId() instead
   */
  getJobId(): string {
    return this.getId();
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
      this.jobId,
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
  async update(options: UpdateJobOptions): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaJobMessage = {
      job_id: this.jobId,
      updated_at: now,
      ...options,
      // Convert Date to string if needed
      started_at: options.started_at ? (options.started_at instanceof Date ? options.started_at.toISOString() : options.started_at) : undefined, 
      finished_at: options.finished_at ? (options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at) : undefined,
    };
    await this.sendMessage('job', data);
  }

  /**
   * Alias for update() - for backward compatibility
   * @deprecated Use update() instead
   */
  async updateJob(options: UpdateJobOptions): Promise<void> {
    return this.update(options);
  }

  /**
   * Start the trace (set status to RUNNING)
   */
  async start(): Promise<void> {
    await this.update({ status: TraceFlowJobStatus.RUNNING });
  }

  /**
   * Alias for start() - for backward compatibility
   * @deprecated Use start() instead
   */
  async startJob(): Promise<void> {
    return this.start();
  }

  /**
   * Complete the trace successfully
   * Automatically closes all pending steps
   */
  async complete(result?: any): Promise<void> {
    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    const data: TraceFlowKafkaJobMessage = {
      job_id: this.jobId,
      status: TraceFlowJobStatus.SUCCESS,
      updated_at: now,
      finished_at: now,
      ...(result !== undefined && { result }),
    };

    await this.sendMessage('job', data);
  }

  /**
   * Finish the trace successfully (alias for complete)
   * Utility method for better readability
   */
  async finish(result?: any): Promise<void> {
    return this.complete(result);
  }

  /**
   * Alias for complete() - for backward compatibility
   * @deprecated Use complete() instead
   */
  async completeJob(result?: any): Promise<void> {
    return this.complete(result);
  }

  /**
   * Alias for finish() - for backward compatibility
   * @deprecated Use finish() instead
   */
  async finishJob(result?: any): Promise<void> {
    return this.finish(result);
  }

  /**
   * Fail the trace
   * Automatically closes all pending steps
   */
  async fail(error: string): Promise<void> {
    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    const data: TraceFlowKafkaJobMessage = {
      job_id: this.jobId,
      status: TraceFlowJobStatus.FAILED,
      updated_at: now,
      finished_at: now,
      error,
    };

    await this.sendMessage('job', data);
  }

  /**
   * Alias for fail() - for backward compatibility
   * @deprecated Use fail() instead
   */
  async failJob(error: string): Promise<void> {
    return this.fail(error);
  }

  /**
   * Cancel the trace
   * Automatically closes all pending steps
   */
  async cancel(): Promise<void> {
    // Close all pending steps first
    await this.closeAllPendingSteps();

    const now = new Date().toISOString();

    const data: TraceFlowKafkaJobMessage = {
      job_id: this.jobId,
      status: TraceFlowJobStatus.CANCELLED,
      updated_at: now,
      finished_at: now,
    };

    await this.sendMessage('job', data);
  }

  /**
   * Alias for cancel() - for backward compatibility
   * @deprecated Use cancel() instead
   */
  async cancelJob(): Promise<void> {
    return this.cancel();
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
      job_id: this.jobId,
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
    const step = new Step(this.jobId, stepNumber, this.source, this.sendMessage);
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
   * Alias for step() - for backward compatibility
   * @deprecated Use step() instead - returns Step instance now
   */
  async traceStep(options: CreateStepOptions = {}): Promise<Step> {
    return this.step(options);
  }

  /**
   * Alias for step() - for backward compatibility
   * @deprecated Use step() instead - returns Step instance now
   */
  async createStep(options: CreateStepOptions = {}): Promise<Step> {
    return this.step(options);
  }

  /**
   * Update an existing step
   */
  async updateStep(stepNumber: number, options: UpdateStepOptions = {}): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      job_id: this.jobId,
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
      job_id: this.jobId,
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
      job_id: this.jobId,
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
   * Can be associated with a specific step or just the job
   */
  async log(options: CreateLogOptions): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaLogMessage = {
      job_id: this.jobId,
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

