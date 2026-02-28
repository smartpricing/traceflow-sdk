package com.smartness.traceflow.enums;

import com.fasterxml.jackson.annotation.JsonValue;

public enum TraceStatus {
    PENDING("PENDING"),
    RUNNING("RUNNING"),
    SUCCESS("SUCCESS"),
    FAILED("FAILED"),
    CANCELLED("CANCELLED");

    private final String value;

    TraceStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }
}
