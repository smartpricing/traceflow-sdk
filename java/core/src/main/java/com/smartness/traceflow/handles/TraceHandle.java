package com.smartness.traceflow.handles;

import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.LogLevel;
import com.smartness.traceflow.enums.TraceEventType;
import com.smartness.traceflow.exception.TraceFlowException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;

public class TraceHandle implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(TraceHandle.class);

    private final String traceId;
    private final String source;
    private final Consumer<TraceEvent> sendEvent;
    private final boolean ownsLifecycle;
    private final Runnable onClose;
    private final List<StepHandle> steps = new ArrayList<>();
    private boolean closed = false;

    public TraceHandle(String traceId, String source, Consumer<TraceEvent> sendEvent) {
        this(traceId, source, sendEvent, false, null);
    }

    public TraceHandle(String traceId, String source, Consumer<TraceEvent> sendEvent, boolean ownsLifecycle, Runnable onClose) {
        this.traceId = traceId;
        this.source = source;
        this.sendEvent = sendEvent;
        this.ownsLifecycle = ownsLifecycle;
        this.onClose = onClose;
    }

    public String getTraceId() {
        return traceId;
    }

    public boolean isClosed() {
        return closed;
    }

    @Override
    public void close() {
        if (ownsLifecycle && !closed) {
            fail("Trace not explicitly closed");
        }
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

        closeOrphanedSteps("Parent trace finished");
        closed = true;
        notifyClosed();

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

        closeOrphanedSteps(error);
        closed = true;
        notifyClosed();

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

        String errorMessage = error.getMessage() != null ? error.getMessage() : error.getClass().getName();

        closeOrphanedSteps(errorMessage);
        closed = true;
        notifyClosed();

        Map<String, Object> payload = new HashMap<>();
        payload.put("error", errorMessage);
        payload.put("stack", TraceFlowException.stackTraceString(error));

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

        closeOrphanedSteps("Parent trace cancelled");
        closed = true;
        notifyClosed();

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

        StepHandle step = new StepHandle(stepId, traceId, source, sendEvent);
        steps.add(step);
        return step;
    }

    /**
     * Execute a callback within a step, guaranteeing the step is closed.
     */
    public <T> T withStep(Function<StepHandle, T> fn, String name, String stepType, Object input, Map<String, Object> metadata) {
        StepHandle step = startStep(name, stepType, input, metadata);
        try {
            T result = fn.apply(step);
            step.finish(result);
            return result;
        } catch (Throwable e) {
            step.fail(e);
            throw e;
        }
    }

    public <T> T withStep(Function<StepHandle, T> fn, String name) {
        return withStep(fn, name, null, null, null);
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

    private void notifyClosed() {
        if (onClose != null) {
            onClose.run();
        }
    }

    private void closeOrphanedSteps(String reason) {
        for (StepHandle step : steps) {
            if (!step.isClosed()) {
                try {
                    step.fail(reason);
                } catch (Exception ignored) {}
            }
        }
        steps.clear();
    }
}
