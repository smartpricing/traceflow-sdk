package com.smartness.traceflow.exception;

public class TraceFlowException extends RuntimeException {

    public TraceFlowException(String message) {
        super(message);
    }

    public TraceFlowException(String message, Throwable cause) {
        super(message, cause);
    }

    public static String stackTraceString(Throwable t) {
        StringBuilder sb = new StringBuilder();
        for (StackTraceElement el : t.getStackTrace()) {
            sb.append(el.toString()).append("\n");
        }
        return sb.toString();
    }
}
