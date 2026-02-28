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

public class StepHandle {

    private static final Logger log = LoggerFactory.getLogger(StepHandle.class);

    private final String stepId;
    private final String traceId;
    private final String source;
    private final Consumer<TraceEvent> sendEvent;
    private boolean closed = false;

    public StepHandle(String stepId, String traceId, String source, Consumer<TraceEvent> sendEvent) {
        this.stepId = stepId;
        this.traceId = traceId;
        this.source = source;
        this.sendEvent = sendEvent;
    }

    public String getStepId() {
        return stepId;
    }

    public String getTraceId() {
        return traceId;
    }

    public void finish() {
        finish(null, null);
    }

    public void finish(Object output) {
        finish(output, null);
    }

    public void finish(Object output, Map<String, Object> metadata) {
        if (closed) {
            log.warn("[TraceFlow] Step {} already closed", stepId);
            return;
        }
        closed = true;

        Map<String, Object> payload = new HashMap<>();
        if (output != null) payload.put("output", output);
        if (metadata != null) payload.put("metadata", metadata);

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.STEP_FINISHED,
                traceId,
                Instant.now().toString(),
                source,
                payload,
                stepId
        ));
    }

    public void fail(String error) {
        if (closed) {
            log.warn("[TraceFlow] Step {} already closed", stepId);
            return;
        }
        closed = true;

        Map<String, Object> payload = new HashMap<>();
        payload.put("error", error);

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.STEP_FAILED,
                traceId,
                Instant.now().toString(),
                source,
                payload,
                stepId
        ));
    }

    public void fail(Throwable error) {
        if (closed) {
            log.warn("[TraceFlow] Step {} already closed", stepId);
            return;
        }
        closed = true;

        Map<String, Object> payload = new HashMap<>();
        payload.put("error", error.getMessage());
        payload.put("stack", getStackTraceString(error));

        sendEvent.accept(new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.STEP_FAILED,
                traceId,
                Instant.now().toString(),
                source,
                payload,
                stepId
        ));
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
                payload,
                stepId
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
