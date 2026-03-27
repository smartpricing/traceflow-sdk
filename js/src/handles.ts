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
  FailTraceOptions,
  FinishStepOptions,
  FailStepOptions,
  StartStepOptions,
  LogOptions,
  LogLevel,
} from './types';
import { ContextManager } from './context-manager';
import { LoggerLike } from './logger';
import { createTraceEvent } from './event-factory';
import { ensureValidUuid } from './validate-uuid';

/**
 * Internal trace handle implementation
 */
export class TraceHandleImpl implements TraceHandle {
  public readonly trace_id: string;
  private source: string;
  private sendEvent: (event: TraceEvent) => Promise<void>;
  private contextManager: ContextManager;
  private logger: LoggerLike;
  private closed: boolean = false;
  private steps: StepHandleImpl[] = [];
  private onClose?: () => void;

  constructor(
    trace_id: string,
    source: string,
    sendEvent: (event: TraceEvent) => Promise<void>,
    contextManager: ContextManager,
    logger?: LoggerLike,
    onClose?: () => void,
  ) {
    this.trace_id = trace_id;
    this.source = source;
    this.sendEvent = sendEvent;
    this.contextManager = contextManager;
    const noop = () => {};
    this.logger = logger || { debug: noop, info: noop, warn: noop, error: noop };
    this.onClose = onClose;
  }

  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Finish trace successfully
   */
  async finish(options?: FinishTraceOptions): Promise<void> {
    if (this.closed) {
      this.logger.warn(`Trace ${this.trace_id} already closed`);
      return;
    }

    await this.closeOrphanedSteps('Parent trace finished');
    this.closed = true;
    this.onClose?.();

    await this.sendEvent(createTraceEvent(
      TraceEventType.TRACE_FINISHED,
      this.trace_id,
      this.source,
      { result: options?.result, metadata: options?.metadata },
    ));
  }

  /**
   * Fail trace with error
   */
  async fail(error: string | Error, options?: FailTraceOptions): Promise<void> {
    if (this.closed) {
      this.logger.warn(`Trace ${this.trace_id} already closed`);
      return;
    }

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    await this.closeOrphanedSteps(errorMessage);
    this.closed = true;
    this.onClose?.();

    await this.sendEvent(createTraceEvent(
      TraceEventType.TRACE_FAILED,
      this.trace_id,
      this.source,
      { error: errorMessage, stack: errorStack, result: options?.result, metadata: options?.metadata },
    ));
  }

  /**
   * Cancel trace
   */
  async cancel(): Promise<void> {
    if (this.closed) {
      this.logger.warn(`Trace ${this.trace_id} already closed`);
      return;
    }

    await this.closeOrphanedSteps('Parent trace cancelled');
    this.closed = true;
    this.onClose?.();

    await this.sendEvent(createTraceEvent(
      TraceEventType.TRACE_CANCELLED,
      this.trace_id,
      this.source,
      {},
    ));
  }

  /**
   * Start a new step within this trace
   */
  async startStep(options?: StartStepOptions): Promise<StepHandle> {
    const step_id = ensureValidUuid(options?.step_id, this.logger, 'step_id');

    await this.sendEvent(createTraceEvent(
      TraceEventType.STEP_STARTED,
      this.trace_id,
      this.source,
      {
        name: options?.name,
        step_type: options?.step_type,
        input: options?.input,
        metadata: options?.metadata,
      },
      step_id,
    ));

    // Update context with step_id
    this.contextManager.updateContext({ step_id });

    const step = new StepHandleImpl(
      step_id,
      this.trace_id,
      this.source,
      this.sendEvent,
      this.contextManager,
      this.logger,
    );

    this.steps.push(step);
    return step;
  }

  /**
   * Execute a callback within a step, guaranteeing the step is closed.
   */
  async withStep<T>(fn: (step: StepHandle) => Promise<T>, options?: StartStepOptions): Promise<T> {
    const step = await this.startStep(options);
    try {
      const result = await fn(step);
      await step.finish({ output: result });
      return result;
    } catch (e) {
      await step.fail(e as Error);
      throw e;
    }
  }

  /**
   * Log message for this trace
   */
  async log(message: string, options?: LogOptions): Promise<void> {
    await this.sendEvent(createTraceEvent(
      TraceEventType.LOG_EMITTED,
      this.trace_id,
      this.source,
      {
        message,
        level: options?.level || LogLevel.INFO,
        event_type: options?.event_type,
        details: options?.details,
      },
      options?.step_id,
    ));
  }

  private async closeOrphanedSteps(reason: string): Promise<void> {
    for (const step of this.steps) {
      if (!step.isClosed()) {
        try {
          await step.fail(reason);
        } catch {
          // ignore
        }
      }
    }
    this.steps = [];
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
  private logger: LoggerLike;
  private closed: boolean = false;
  private onClose?: () => void;

  constructor(
    step_id: string,
    trace_id: string,
    source: string,
    sendEvent: (event: TraceEvent) => Promise<void>,
    contextManager: ContextManager,
    logger?: LoggerLike,
    onClose?: () => void,
  ) {
    this.step_id = step_id;
    this.trace_id = trace_id;
    this.source = source;
    this.sendEvent = sendEvent;
    this.contextManager = contextManager;
    const noop = () => {};
    this.logger = logger || { debug: noop, info: noop, warn: noop, error: noop };
    this.onClose = onClose;
  }

  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Finish step successfully
   */
  async finish(options?: FinishStepOptions): Promise<void> {
    if (this.closed) {
      this.logger.warn(`Step ${this.step_id} already closed`);
      return;
    }

    this.closed = true;
    this.onClose?.();

    await this.sendEvent(createTraceEvent(
      TraceEventType.STEP_FINISHED,
      this.trace_id,
      this.source,
      { output: options?.output, metadata: options?.metadata },
      this.step_id,
    ));

    // Clear step from context
    this.contextManager.updateContext({ step_id: undefined });
  }

  /**
   * Fail step with error
   */
  async fail(error: string | Error, options?: FailStepOptions): Promise<void> {
    if (this.closed) {
      this.logger.warn(`Step ${this.step_id} already closed`);
      return;
    }

    this.closed = true;
    this.onClose?.();

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    await this.sendEvent(createTraceEvent(
      TraceEventType.STEP_FAILED,
      this.trace_id,
      this.source,
      { error: errorMessage, stack: errorStack, output: options?.output, metadata: options?.metadata },
      this.step_id,
    ));

    // Clear step from context
    this.contextManager.updateContext({ step_id: undefined });
  }

  /**
   * Log message for this step
   */
  async log(message: string, options?: LogOptions): Promise<void> {
    await this.sendEvent(createTraceEvent(
      TraceEventType.LOG_EMITTED,
      this.trace_id,
      this.source,
      {
        message,
        level: options?.level || LogLevel.INFO,
        event_type: options?.event_type,
        details: options?.details,
      },
      this.step_id,
    ));
  }
}
