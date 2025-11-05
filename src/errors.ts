/**
 * Custom error classes for TraceFlow SDK
 */

/**
 * Base error class for all TraceFlow errors
 */
export class TraceFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceFlowError';
    Object.setPrototypeOf(this, TraceFlowError.prototype);
  }
}

/**
 * Thrown when attempting to perform an operation on a trace that is already completed/failed/cancelled
 */
export class TraceClosedError extends TraceFlowError {
  constructor(traceId: string, status: string) {
    super(`Trace ${traceId} is already closed with status: ${status}. Cannot perform further operations.`);
    this.name = 'TraceClosedError';
    Object.setPrototypeOf(this, TraceClosedError.prototype);
  }
}

/**
 * Thrown when attempting to perform an operation on a step that is already completed/failed
 */
export class StepClosedError extends TraceFlowError {
  constructor(traceId: string, stepNumber: number, status: string) {
    super(`Step ${stepNumber} of trace ${traceId} is already closed with status: ${status}. Cannot perform further operations.`);
    this.name = 'StepClosedError';
    Object.setPrototypeOf(this, StepClosedError.prototype);
  }
}

/**
 * Thrown when attempting to create a duplicate trace/step when preventDuplicates is enabled
 */
export class DuplicateError extends TraceFlowError {
  constructor(type: 'trace' | 'step', identifier: string) {
    super(`${type === 'trace' ? 'Trace' : 'Step'} ${identifier} already exists. Duplicate prevention is enabled.`);
    this.name = 'DuplicateError';
    Object.setPrototypeOf(this, DuplicateError.prototype);
  }
}

/**
 * Thrown when attempting to use a client that hasn't been initialized
 */
export class ClientNotInitializedError extends TraceFlowError {
  constructor() {
    super('TraceFlowClient has not been initialized. Call new TraceFlowClient() first.');
    this.name = 'ClientNotInitializedError';
    Object.setPrototypeOf(this, ClientNotInitializedError.prototype);
  }
}

/**
 * Thrown when attempting to perform an operation that requires Redis but Redis is not configured
 */
export class RedisNotConfiguredError extends TraceFlowError {
  constructor(operation: string) {
    super(`Redis is not configured. Operation '${operation}' requires Redis to be enabled.`);
    this.name = 'RedisNotConfiguredError';
    Object.setPrototypeOf(this, RedisNotConfiguredError.prototype);
  }
}

/**
 * Thrown when attempting to perform an invalid state transition
 */
export class InvalidStateTransitionError extends TraceFlowError {
  constructor(type: 'trace' | 'step', currentStatus: string, attemptedStatus: string) {
    super(`Invalid state transition for ${type}: cannot transition from ${currentStatus} to ${attemptedStatus}.`);
    this.name = 'InvalidStateTransitionError';
    Object.setPrototypeOf(this, InvalidStateTransitionError.prototype);
  }
}

