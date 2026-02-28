package com.smartness.traceflow.exception;

public class TraceFlowException extends RuntimeException {

    public TraceFlowException(String message) {
        super(message);
    }

    public TraceFlowException(String message, Throwable cause) {
        super(message, cause);
    }
}
