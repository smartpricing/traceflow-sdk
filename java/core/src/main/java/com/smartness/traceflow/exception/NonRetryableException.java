package com.smartness.traceflow.exception;

/**
 * Marks an error that must not be retried — typically a 4xx client error, which
 * is deterministic and will not succeed on a second attempt. The retry executor
 * surfaces it immediately instead of burning the retry budget.
 */
public class NonRetryableException extends TraceFlowException {

    public NonRetryableException(String message) {
        super(message);
    }
}
