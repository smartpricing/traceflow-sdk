package com.smartness.traceflow.transport;

import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.StepStatus;
import com.smartness.traceflow.enums.TraceEventType;
import com.smartness.traceflow.enums.TraceStatus;

import java.util.LinkedHashMap;
import java.util.Map;

public final class EventRouter {

    public record Route(String method, String path, Map<String, Object> payload) {}

    private EventRouter() {}

    public static Route route(TraceEvent event) {
        return switch (event.eventType()) {
            case TRACE_STARTED -> createTrace(event);
            case TRACE_FINISHED, TRACE_FAILED, TRACE_CANCELLED -> updateTrace(event);
            case STEP_STARTED -> createStep(event);
            case STEP_FINISHED, STEP_FAILED -> updateStep(event);
            case LOG_EMITTED -> createLog(event);
        };
    }

    private static Route createTrace(TraceEvent event) {
        Map<String, Object> payload = filterNulls(Map.ofEntries(
                Map.entry("trace_id", event.traceId()),
                entry("trace_type", event.payload().get("trace_type")),
                Map.entry("status", TraceStatus.PENDING.getValue()),
                Map.entry("source", event.source()),
                Map.entry("created_at", event.timestamp()),
                Map.entry("updated_at", event.timestamp()),
                Map.entry("last_activity_at", event.timestamp()),
                entry("title", event.payload().get("title")),
                entry("description", event.payload().get("description")),
                entry("owner", event.payload().get("owner")),
                entry("tags", event.payload().get("tags")),
                entry("metadata", event.payload().get("metadata")),
                entry("params", event.payload().get("params")),
                entry("idempotency_key", event.payload().getOrDefault("idempotency_key", event.eventId())),
                entry("trace_timeout_ms", event.payload().get("trace_timeout_ms")),
                entry("step_timeout_ms", event.payload().get("step_timeout_ms"))
        ));
        return new Route("POST", "/api/v1/traces", payload);
    }

    private static Route updateTrace(TraceEvent event) {
        TraceStatus status = switch (event.eventType()) {
            case TRACE_FINISHED -> TraceStatus.SUCCESS;
            case TRACE_FAILED -> TraceStatus.FAILED;
            case TRACE_CANCELLED -> TraceStatus.CANCELLED;
            default -> TraceStatus.RUNNING;
        };

        Map<String, Object> payload = filterNulls(Map.ofEntries(
                Map.entry("status", status.getValue()),
                Map.entry("updated_at", event.timestamp()),
                Map.entry("finished_at", event.timestamp()),
                Map.entry("last_activity_at", event.timestamp()),
                entry("result", event.payload().get("result")),
                entry("error", event.payload().get("error")),
                entry("metadata", event.payload().get("metadata"))
        ));
        return new Route("PATCH", "/api/v1/traces/" + event.traceId(), payload);
    }

    private static Route createStep(TraceEvent event) {
        Map<String, Object> payload = filterNulls(Map.ofEntries(
                Map.entry("trace_id", event.traceId()),
                entry("step_id", event.stepId()),
                entry("step_type", event.payload().get("step_type")),
                entry("name", event.payload().get("name")),
                Map.entry("status", StepStatus.STARTED.getValue()),
                Map.entry("started_at", event.timestamp()),
                Map.entry("updated_at", event.timestamp()),
                entry("input", event.payload().get("input")),
                entry("metadata", event.payload().get("metadata"))
        ));
        return new Route("POST", "/api/v1/steps", payload);
    }

    private static Route updateStep(TraceEvent event) {
        StepStatus status = event.eventType() == TraceEventType.STEP_FINISHED
                ? StepStatus.COMPLETED
                : StepStatus.FAILED;

        Map<String, Object> payload = filterNulls(Map.ofEntries(
                Map.entry("status", status.getValue()),
                Map.entry("updated_at", event.timestamp()),
                Map.entry("finished_at", event.timestamp()),
                entry("output", event.payload().get("output")),
                entry("error", event.payload().get("error")),
                entry("metadata", event.payload().get("metadata"))
        ));
        return new Route("PATCH", "/api/v1/steps/" + event.traceId() + "/" + event.stepId(), payload);
    }

    private static Route createLog(TraceEvent event) {
        Map<String, Object> payload = filterNulls(Map.ofEntries(
                Map.entry("trace_id", event.traceId()),
                Map.entry("log_time", event.timestamp()),
                Map.entry("log_id", event.eventId()),
                entry("level", event.payload().getOrDefault("level", "INFO")),
                entry("message", event.payload().get("message")),
                entry("details", event.payload().get("details")),
                Map.entry("source", event.source()),
                entry("event_type", event.payload().get("event_type"))
        ));
        return new Route("POST", "/api/v1/logs", payload);
    }

    private static Map.Entry<String, Object> entry(String key, Object value) {
        return Map.entry(key, value != null ? value : NULL_SENTINEL);
    }

    private static final Object NULL_SENTINEL = new Object();

    private static Map<String, Object> filterNulls(Map<String, Object> map) {
        var result = new LinkedHashMap<String, Object>();
        map.forEach((k, v) -> {
            if (v != NULL_SENTINEL) {
                result.put(k, v);
            }
        });
        return result;
    }
}
