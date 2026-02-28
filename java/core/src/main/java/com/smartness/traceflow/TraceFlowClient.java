package com.smartness.traceflow;

import com.smartness.traceflow.context.TraceFlowContext;
import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.LogLevel;
import com.smartness.traceflow.enums.TraceEventType;
import com.smartness.traceflow.handles.StepHandle;
import com.smartness.traceflow.handles.TraceHandle;
import com.smartness.traceflow.transport.AsyncHttpTransport;
import com.smartness.traceflow.transport.HttpTransport;
import com.smartness.traceflow.transport.Transport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

public class TraceFlowClient {

    private static final Logger log = LoggerFactory.getLogger(TraceFlowClient.class);

    private final TraceFlowConfig config;
    private final Transport transport;

    public TraceFlowClient(TraceFlowConfig config) {
        this.config = config;
        this.transport = config.async()
                ? new AsyncHttpTransport(config)
                : new HttpTransport(config);
    }

    public static TraceFlowClient create() {
        return new TraceFlowClient(TraceFlowConfig.fromEnv());
    }

    public static TraceFlowClient create(TraceFlowConfig config) {
        return new TraceFlowClient(config);
    }

    public TraceHandle startTrace() {
        return startTrace(StartTraceOptions.builder().build());
    }

    public TraceHandle startTrace(StartTraceOptions options) {
        String traceId = options.traceId() != null ? options.traceId() : UUID.randomUUID().toString();

        Map<String, Object> payload = new HashMap<>();
        putIfNotNull(payload, "trace_type", options.traceType());
        putIfNotNull(payload, "title", options.title());
        putIfNotNull(payload, "description", options.description());
        putIfNotNull(payload, "owner", options.owner());
        putIfNotNull(payload, "tags", options.tags());
        putIfNotNull(payload, "metadata", options.metadata());
        putIfNotNull(payload, "params", options.params());
        putIfNotNull(payload, "trace_timeout_ms", options.traceTimeoutMs());
        putIfNotNull(payload, "step_timeout_ms", options.stepTimeoutMs());

        TraceEvent event = new TraceEvent(
                UUID.randomUUID().toString(),
                TraceEventType.TRACE_STARTED,
                traceId,
                Instant.now().toString(),
                config.source(),
                payload
        );

        sendEvent(event);
        TraceFlowContext.set(traceId);

        return new TraceHandle(traceId, config.source(), this::sendEvent);
    }

    public TraceHandle getCurrentTrace() {
        String traceId = TraceFlowContext.currentTraceId();
        if (traceId == null) return null;
        return new TraceHandle(traceId, config.source(), this::sendEvent);
    }

    public <T> T runWithTrace(Function<TraceHandle, T> callback, StartTraceOptions options) {
        TraceHandle trace = startTrace(options);
        try {
            T result = callback.apply(trace);
            trace.finish(result instanceof Map ? castToMap(result) : Map.of("result", result));
            return result;
        } catch (Throwable e) {
            trace.fail(e);
            throw e;
        }
    }

    public <T> T runWithTrace(Function<TraceHandle, T> callback) {
        return runWithTrace(callback, StartTraceOptions.builder().build());
    }

    public StepHandle startStep(String name) {
        return startStep(name, null, null, null);
    }

    public StepHandle startStep(String name, String stepType, Object input, Map<String, Object> metadata) {
        TraceHandle trace = getCurrentTrace();
        if (trace == null) {
            log.warn("[TraceFlow] No active trace context for step");
            return null;
        }
        return trace.startStep(name, stepType, input, metadata);
    }

    public void log(String message) {
        log(message, LogLevel.INFO, null, null);
    }

    public void log(String message, LogLevel level) {
        log(message, level, null, null);
    }

    public void log(String message, LogLevel level, String eventType, Object details) {
        TraceHandle trace = getCurrentTrace();
        if (trace == null) {
            log.info("[TraceFlow] {}", message);
            return;
        }
        trace.log(message, level, eventType, details);
    }

    public void flush() {
        transport.flush();
    }

    public void shutdown() {
        log.debug("[TraceFlow] Shutting down SDK...");
        transport.shutdown();
    }

    private void sendEvent(TraceEvent event) {
        try {
            transport.send(event);
        } catch (Exception e) {
            if (config.silentErrors()) {
                log.warn("[TraceFlow] Error sending event (silenced): {}", e.getMessage());
            } else {
                throw e;
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Map<String, Object> castToMap(T value) {
        return (Map<String, Object>) value;
    }

    private static void putIfNotNull(Map<String, Object> map, String key, Object value) {
        if (value != null) map.put(key, value);
    }
}
