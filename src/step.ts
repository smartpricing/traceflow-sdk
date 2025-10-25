import {
  TraceFlowKafkaStepMessage,
  TraceFlowStepStatus,
  UpdateStepOptions,
  CreateLogOptions,
  TraceFlowLogLevel,
  TraceFlowKafkaLogMessage,
} from './types';

/**
 * Step - Represents a single step in a trace
 * Provides methods to manage the step's lifecycle
 */
export class Step {
  private jobId: string;
  private stepNumber: number;
  private source?: string;
  private closed: boolean = false;
  private sendMessage: (
    type: 'job' | 'step' | 'log',
    data: any
  ) => Promise<void>;

  constructor(
    jobId: string,
    stepNumber: number,
    source: string | undefined,
    sendMessage: (type: 'job' | 'step' | 'log', data: any) => Promise<void>
  ) {
    this.jobId = jobId;
    this.stepNumber = stepNumber;
    this.source = source;
    this.sendMessage = sendMessage;
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

    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      job_id: this.jobId,
      step_number: this.stepNumber,
      updated_at: now,
      ...options,
      // Convert Date to string if needed
      finished_at: options.finished_at instanceof Date ? options.finished_at.toISOString() : options.finished_at,
    };

    await this.sendMessage('step', data);
  }

  /**
   * Complete the step successfully
   */
  async complete(output?: any): Promise<void> {
    if (this.closed) {
      throw new Error(`Step ${this.stepNumber} is already closed`);
    }

    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      job_id: this.jobId,
      step_number: this.stepNumber,
      status: TraceFlowStepStatus.COMPLETED,
      finished_at: now,
      updated_at: now,
      ...(output !== undefined && { output }),
    };

    await this.sendMessage('step', data);
    this.closed = true;
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

    const now = new Date().toISOString();

    const data: TraceFlowKafkaStepMessage = {
      job_id: this.jobId,
      step_number: this.stepNumber,
      status: TraceFlowStepStatus.FAILED,
      finished_at: now,
      updated_at: now,
      error,
    };

    await this.sendMessage('step', data);
    this.closed = true;
  }

  /**
   * Add a log to this step
   */
  async log(message: string, level: TraceFlowLogLevel | string = TraceFlowLogLevel.INFO, details?: any): Promise<void> {
    const now = new Date().toISOString();

    const data: TraceFlowKafkaLogMessage = {
      job_id: this.jobId,
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

