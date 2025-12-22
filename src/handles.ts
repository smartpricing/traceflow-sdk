/**
 * Trace and Step Handles
 * User-facing objects for managing trace/step lifecycle
 */

import { v4 as uuidv4 } from 'uuid';
import {
  TraceHandle,
  StepHandle,
  TraceEvent,
  TraceEventType,
  FinishTraceOptions,
  FinishStepOptions,
  StartStepOptions,
  LogOptions,
  LogLevel,
} from './types';
import { ContextManager } from './context-manager';

/**
 * Internal trace handle implementation
 */
export class TraceHandleImpl implements TraceHandle {
  public readonly trace_id: string;
  private source: string;
  private sendEvent: (event: TraceEvent) => Promise<void>;
  private contextManager: ContextManager;
  private closed: boolean = false;

  constructor(
    trace_id: string,
    source: string,
    sendEvent: (event: TraceEvent) => Promise<void>,
    contextManager: ContextManager
  ) {
    this.trace_id = trace_id;
    this.source = source;
    this.sendEvent = sendEvent;
    this.contextManager = contextManager;
  }

  /**
   * Finish trace successfully
   */
  async finish(options?: FinishTraceOptions): Promise<void> {
    if (this.closed) {
      console.warn(`[TraceFlow] Trace ${this.trace_id} already closed`);
      return;
    }

    this.closed = true;

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.TRACE_FINISHED,
      trace_id: this.trace_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {
        result: options?.result,
        metadata: options?.metadata,
      },
    };

    await this.sendEvent(event);
  }

  /**
   * Fail trace with error
   */
  async fail(error: string | Error): Promise<void> {
    if (this.closed) {
      console.warn(`[TraceFlow] Trace ${this.trace_id} already closed`);
      return;
    }

    this.closed = true;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.TRACE_FAILED,
      trace_id: this.trace_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {
        error: errorMessage,
        stack: errorStack,
      },
    };

    await this.sendEvent(event);
  }

  /**
   * Cancel trace
   */
  async cancel(): Promise<void> {
    if (this.closed) {
      console.warn(`[TraceFlow] Trace ${this.trace_id} already closed`);
      return;
    }

    this.closed = true;

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.TRACE_CANCELLED,
      trace_id: this.trace_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {},
    };

    await this.sendEvent(event);
  }

  /**
   * Start a new step within this trace
   */
  async startStep(options?: StartStepOptions): Promise<StepHandle> {
    const step_id = options?.step_id || uuidv4();

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.STEP_STARTED,
      trace_id: this.trace_id,
      step_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {
        name: options?.name,
        step_type: options?.step_type,
        input: options?.input,
        metadata: options?.metadata,
      },
    };

    await this.sendEvent(event);

    // Update context with step_id
    this.contextManager.updateContext({ step_id });

    return new StepHandleImpl(
      step_id,
      this.trace_id,
      this.source,
      this.sendEvent,
      this.contextManager
    );
  }

  /**
   * Log message for this trace
   */
  async log(message: string, options?: LogOptions): Promise<void> {
    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.LOG_EMITTED,
      trace_id: this.trace_id,
      step_id: options?.step_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {
        message,
        level: options?.level || LogLevel.INFO,
        event_type: options?.event_type,
        details: options?.details,
      },
    };

    await this.sendEvent(event);
  }
}

/**
 * Internal step handle implementation
 */
export class StepHandleImpl implements StepHandle {
  public readonly step_id: string;
  public readonly trace_id: string;
  private source: string;
  private sendEvent: (event: TraceEvent) => Promise<void>;
  private contextManager: ContextManager;
  private closed: boolean = false;

  constructor(
    step_id: string,
    trace_id: string,
    source: string,
    sendEvent: (event: TraceEvent) => Promise<void>,
    contextManager: ContextManager
  ) {
    this.step_id = step_id;
    this.trace_id = trace_id;
    this.source = source;
    this.sendEvent = sendEvent;
    this.contextManager = contextManager;
  }

  /**
   * Finish step successfully
   */
  async finish(options?: FinishStepOptions): Promise<void> {
    if (this.closed) {
      console.warn(`[TraceFlow] Step ${this.step_id} already closed`);
      return;
    }

    this.closed = true;

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.STEP_FINISHED,
      trace_id: this.trace_id,
      step_id: this.step_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {
        output: options?.output,
        metadata: options?.metadata,
      },
    };

    await this.sendEvent(event);

    // Clear step from context
    this.contextManager.updateContext({ step_id: undefined });
  }

  /**
   * Fail step with error
   */
  async fail(error: string | Error): Promise<void> {
    if (this.closed) {
      console.warn(`[TraceFlow] Step ${this.step_id} already closed`);
      return;
    }

    this.closed = true;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.STEP_FAILED,
      trace_id: this.trace_id,
      step_id: this.step_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {
        error: errorMessage,
        stack: errorStack,
      },
    };

    await this.sendEvent(event);

    // Clear step from context
    this.contextManager.updateContext({ step_id: undefined });
  }

  /**
   * Log message for this step
   */
  async log(message: string, options?: LogOptions): Promise<void> {
    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.LOG_EMITTED,
      trace_id: this.trace_id,
      step_id: this.step_id,
      timestamp: new Date().toISOString(),
      source: this.source,
      payload: {
        message,
        level: options?.level || LogLevel.INFO,
        event_type: options?.event_type,
        details: options?.details,
      },
    };

    await this.sendEvent(event);
  }
}

