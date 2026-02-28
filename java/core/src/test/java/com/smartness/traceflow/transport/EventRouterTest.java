package com.smartness.traceflow.transport;

import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.TraceEventType;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class EventRouterTest {

    @Test
    void traceStartedRoutesToPost() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_STARTED,
                "trace-1", "2026-01-01T00:00:00Z", "test",
                Map.of("title", "Test", "trace_type", "unit-test"));

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("POST", route.method());
        assertEquals("/api/v1/traces", route.path());
        assertEquals("trace-1", route.payload().get("trace_id"));
        assertEquals("PENDING", route.payload().get("status"));
        assertEquals("Test", route.payload().get("title"));
        assertEquals("unit-test", route.payload().get("trace_type"));
    }

    @Test
    void traceFinishedRoutesToPatch() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_FINISHED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of());

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("PATCH", route.method());
        assertEquals("/api/v1/traces/trace-1", route.path());
        assertEquals("SUCCESS", route.payload().get("status"));
    }

    @Test
    void traceFailedSetsFailedStatus() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_FAILED,
                "trace-1", "2026-01-01T00:00:00Z", "test",
                Map.of("error", "something failed"));

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("FAILED", route.payload().get("status"));
        assertEquals("something failed", route.payload().get("error"));
    }

    @Test
    void traceCancelledSetsCancelledStatus() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_CANCELLED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of());

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("CANCELLED", route.payload().get("status"));
    }

    @Test
    void stepStartedRoutesToPost() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.STEP_STARTED,
                "trace-1", "2026-01-01T00:00:00Z", "test",
                Map.of("name", "my-step", "step_type", "processing"), "step-1");

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("POST", route.method());
        assertEquals("/api/v1/steps", route.path());
        assertEquals("STARTED", route.payload().get("status"));
        assertEquals("my-step", route.payload().get("name"));
        assertEquals("step-1", route.payload().get("step_id"));
    }

    @Test
    void stepFinishedRoutesToPatch() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.STEP_FINISHED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of(), "step-1");

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("PATCH", route.method());
        assertEquals("/api/v1/steps/trace-1/step-1", route.path());
        assertEquals("COMPLETED", route.payload().get("status"));
    }

    @Test
    void stepFailedSetsFailedStatus() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.STEP_FAILED,
                "trace-1", "2026-01-01T00:00:00Z", "test",
                Map.of("error", "step error"), "step-1");

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("FAILED", route.payload().get("status"));
    }

    @Test
    void logEmittedRoutesToPost() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.LOG_EMITTED,
                "trace-1", "2026-01-01T00:00:00Z", "test",
                Map.of("message", "hello", "level", "INFO"));

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("POST", route.method());
        assertEquals("/api/v1/logs", route.path());
        assertEquals("hello", route.payload().get("message"));
        assertEquals("INFO", route.payload().get("level"));
        assertEquals("ev-1", route.payload().get("log_id"));
    }

    @Test
    void idempotencyKeyDefaultsToEventId() {
        TraceEvent event = new TraceEvent("ev-123", TraceEventType.TRACE_STARTED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of());

        EventRouter.Route route = EventRouter.route(event);

        assertEquals("ev-123", route.payload().get("idempotency_key"));
    }

    @Test
    void nullPayloadValuesAreFiltered() {
        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_STARTED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of());

        EventRouter.Route route = EventRouter.route(event);

        assertFalse(route.payload().containsKey("title"));
        assertFalse(route.payload().containsKey("description"));
        assertFalse(route.payload().containsKey("tags"));
    }
}
