package com.smartness.traceflow.enums;

import com.fasterxml.jackson.annotation.JsonValue;

public enum StepStatus {
    STARTED("STARTED"),
    IN_PROGRESS("IN_PROGRESS"),
    COMPLETED("COMPLETED"),
    FAILED("FAILED");

    private final String value;

    StepStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }
}
