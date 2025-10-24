import { v4 as uuidv4 } from 'uuid';
import {
  TraceFlowJobStatus,
  TraceFlowStepStatus,
  CreateStepOptions,
  UpdateStepOptions,
  CreateLogOptions,
  TraceFlowKafkaJobMessage,
  TraceFlowKafkaStepMessage,
  TraceFlowKafkaLogMessage,
  UpdateJobOptions,
} from './types';

/**
 * JobManager - Manages a specific job and its steps
 * Provides auto-increment logic for step numbers
 */
export class JobManager {
  private jobId: string;
  private source?: string;
  private currentStepNumber: number = -1;
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
    ) => Promise<void>
  ) {
    this.jobId = jobId;
    this.source = source;
    this.sendMessage = sendMessage;
  }

  /**
   * Get the job ID
   */
  getJobId(): string {
    return this.jobId;
  }

  /**
   * Update the job
   */
  async updateJob(options: UpdateJobOptions): Promise<void> {
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
   * Start the trace (set status to RUNNING)
   */
  async start(): Promise<void> {
    await this.updateJob({ status: TraceFlowJobStatus.RUNNING });
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
   */
  async complete(result?: any): Promise<void> {
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
   */
  async fail(error: string): Promise<void> {
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
   */
  async cancel(): Promise<void> {
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
   */
  async step(options: CreateStepOptions = {}): Promise<number> {
    const now = new Date().toISOString();

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
    return stepNumber;
  }

  /**
   * Alias for step() - for backward compatibility
   * @deprecated Use step() instead
   */
  async traceStep(options: CreateStepOptions = {}): Promise<number> {
    return this.step(options);
  }

  /**
   * Alias for step() - for backward compatibility
   * @deprecated Use step() instead
   */
  async createStep(options: CreateStepOptions = {}): Promise<number> {
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

