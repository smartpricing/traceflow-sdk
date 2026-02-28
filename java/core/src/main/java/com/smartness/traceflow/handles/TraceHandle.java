package com.smartness.traceflow.handles;

import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.LogLevel;
import com.smartness.traceflow.enums.TraceEventType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

public class TraceHandle {

    private static final Logger log = LoggerFactory.getLogger(TraceHandle.class);

    private final String traceId;
    private final String source;
    private final Consumer<TraceEvent> sendEvent;
    private boolean closed = false;

    public TraceHandle(String traceId, String source, Consumer<TraceEvent> sendEvent) {
        this.traceId = traceId;
        this.source = source;
        this.sendEvent = sendEvent;
    }

    public String getTraceId() {
        return traceId;
    }

    public void finish() {
        finish(null, null);
    }

    public void finish(Map<String, Object> result) {
        finish(result, null);
    }

    public void finish(Map<String, Object> result, Map<String, Object> metadata) {
        if (closed) {
            log.warn("[TraceFlow] Trace {} already closed", traceId);
            return;
        }
        closed = true;

        Map<String, Object> payload = new HashMap<>();
        if (result != null) payload.put("result", result);
        if (metadata != null) payload.put("metadata", metadata);

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.TRACE_FINISHED,
                traceId,
                Instant.now().toString(),
                source,
                payload
        ));
    }

    public void fail(String error) {
        if (closed) {
            log.warn("[TraceFlow] Trace {} already closed", traceId);
            return;
        }
        closed = true;

        Map<String, Object> payload = new HashMap<>();
        payload.put("error", error);

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.TRACE_FAILED,
                traceId,
                Instant.now().toString(),
                source,
                payload
        ));
    }

    public void fail(Throwable error) {
        if (closed) {
            log.warn("[TraceFlow] Trace {} already closed", traceId);
            return;
        }
        closed = true;

        Map<String, Object> payload = new HashMap<>();
        payload.put("error", error.getMessage());
        payload.put("stack", getStackTraceString(error));

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.TRACE_FAILED,
                traceId,
                Instant.now().toString(),
                source,
                payload
        ));
    }

    public void cancel() {
        if (closed) {
            log.warn("[TraceFlow] Trace {} already closed", traceId);
            return;
        }
        closed = true;

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.TRACE_CANCELLED,
                traceId,
                Instant.now().toString(),
                source,
                Map.of()
        ));
    }

    public StepHandle startStep(String name) {
        return startStep(name, null, null, null);
    }

    public StepHandle startStep(String name, String stepType) {
        return startStep(name, stepType, null, null);
    }

    public StepHandle startStep(String name, String stepType, Object input, Map<String, Object> metadata) {
        String stepId = UUID.randomUUID().toString();

        Map<String, Object> payload = new HashMap<>();
        if (name != null) payload.put("name", name);
        if (stepType != null) payload.put("step_type", stepType);
        if (input != null) payload.put("input", input);
        if (metadata != null) payload.put("metadata", metadata);

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.STEP_STARTED,
                traceId,
                Instant.now().toString(),
                source,
                payload,
                stepId
        ));

        return new StepHandle(stepId, traceId, source, sendEvent);
    }

    public void log(String message) {
        log(message, LogLevel.INFO, null, null);
    }

    public void log(String message, LogLevel level) {
        log(message, level, null, null);
    }

    public void log(String message, LogLevel level, String eventType, Object details) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("message", message);
        payload.put("level", level.getValue());
        if (eventType != null) payload.put("event_type", eventType);
        if (details != null) payload.put("details", details);

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.LOG_EMITTED,
                traceId,
                Instant.now().toString(),
                source,
                payload
        ));
    }

    private static String getStackTraceString(Throwable t) {
        StringBuilder sb = new StringBuilder();
        for (StackTraceElement el : t.getStackTrace()) {
            sb.append(el.toString()).append("\n");
        }
        return sb.toString();
    }
}
