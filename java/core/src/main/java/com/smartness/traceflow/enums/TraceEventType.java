package com.smartness.traceflow.enums;

import com.fasterxml.jackson.annotation.JsonValue;

public enum TraceEventType {
    TRACE_STARTED("trace_started"),
    TRACE_FINISHED("trace_finished"),
    TRACE_FAILED("trace_failed"),
    TRACE_CANCELLED("trace_cancelled"),
    STEP_STARTED("step_started"),
    STEP_FINISHED("step_finished"),
    STEP_FAILED("step_failed"),
    LOG_EMITTED("log_emitted");

    private final String value;

    TraceEventType(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }
}
