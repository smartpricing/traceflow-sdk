import { v4 as uuidv4 } from 'uuid';
import {
  JobStatus,
  StepStatus,
  CreateStepOptions,
  UpdateStepOptions,
  CreateLogOptions,
  KafkaJobMessage,
  KafkaStepMessage,
  KafkaLogMessage,
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
    data: KafkaJobMessage | KafkaStepMessage | KafkaLogMessage
  ) => Promise<void>;

  constructor(
    jobId: string,
    source: string | undefined,
    sendMessage: (
      type: 'job' | 'step' | 'log',
      data: KafkaJobMessage | KafkaStepMessage | KafkaLogMessage
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

    const data: KafkaJobMessage = {
      job_id: this.jobId,
      updated_at: now,
      ...options,
      // Convert Date to string if needed
      started_at: options.started_at instanceof Date ? options.started_at.toISOString() : options.started_at,
      finished_at: options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at,
    };

    await this.sendMessage('job', data);
  }

  /**
   * Complete the job successfully
   */
  async completeJob(result?: any): Promise<void> {
    const now = new Date().toISOString();

    const data: KafkaJobMessage = {
      job_id: this.jobId,
      status: JobStatus.SUCCESS,
      updated_at: now,
      finished_at: now,
      ...(result !== undefined && { result }),
    };

    await this.sendMessage('job', data);
  }

  /**
   * Fail the job
   */
  async failJob(error: string): Promise<void> {
    const now = new Date().toISOString();

    const data: KafkaJobMessage = {
      job_id: this.jobId,
      status: JobStatus.FAILED,
      updated_at: now,
      finished_at: now,
      error,
    };

    await this.sendMessage('job', data);
  }

  /**
   * Cancel the job
   */
  async cancelJob(): Promise<void> {
    const now = new Date().toISOString();

    const data: KafkaJobMessage = {
      job_id: this.jobId,
      status: JobStatus.CANCELLED,
      updated_at: now,
      finished_at: now,
    };

    await this.sendMessage('job', data);
  }

  /**
   * Create a new step
   * If step_number is not provided, it will be auto-incremented
   */
  async createStep(options: CreateStepOptions = {}): Promise<number> {
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

    const data: KafkaStepMessage = {
      job_id: this.jobId,
      step_number: stepNumber,
      step_id: options.step_id || uuidv4(),
      step_type: options.step_type,
      name: options.name,
      status: options.status || StepStatus.STARTED,
      started_at: now,
      updated_at: now,
      input: options.input,
      metadata: options.metadata,
    };

    await this.sendMessage('step', data);
    return stepNumber;
  }

  /**
   * Update an existing step
   */
  async updateStep(stepNumber: number, options: UpdateStepOptions = {}): Promise<void> {
    const now = new Date().toISOString();

    const data: KafkaStepMessage = {
      job_id: this.jobId,
      step_number: stepNumber,
      updated_at: now,
      ...options,
      // Convert Date to string if needed
      finished_at: options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at,
    };

    await this.sendMessage('step', data);
  }

  /**
   * Complete a step successfully
   */
  async completeStep(stepNumber: number, output?: any): Promise<void> {
    const now = new Date().toISOString();

    const data: KafkaStepMessage = {
      job_id: this.jobId,
      step_number: stepNumber,
      status: StepStatus.COMPLETED,
      finished_at: now,
      updated_at: now,
      ...(output !== undefined && { output }),
    };

    await this.sendMessage('step', data);
  }

  /**
   * Fail a step
   */
  async failStep(stepNumber: number, error: string): Promise<void> {
    const now = new Date().toISOString();

    const data: KafkaStepMessage = {
      job_id: this.jobId,
      step_number: stepNumber,
      status: StepStatus.FAILED,
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

    const data: KafkaLogMessage = {
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

