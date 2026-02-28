package com.smartness.traceflow.dto;

import com.smartness.traceflow.enums.TraceEventType;

import java.util.Map;

public record TraceEvent(
        String eventId,
        TraceEventType eventType,
        String traceId,
        String timestamp,
        String source,
        Map<String, Object> payload,
        String stepId
) {
    public TraceEvent(String eventId, TraceEventType eventType, String traceId,
                      String timestamp, String source, Map<String, Object> payload) {
        this(eventId, eventType, traceId, timestamp, source, payload, null);
    }
}
