package com.smartness.traceflow.handles;

import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.LogLevel;
import com.smartness.traceflow.enums.TraceEventType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TraceHandleTest {

    private List<TraceEvent> events;
    private TraceHandle handle;

    @BeforeEach
    void setUp() {
        events = new ArrayList<>();
        handle = new TraceHandle("trace-1", "test-source", events::add);
    }

    @Test
    void getTraceId() {
        assertEquals("trace-1", handle.getTraceId());
    }

    @Test
    void finishSendsEvent() {
        handle.finish(Map.of("status", "ok"));

        assertEquals(1, events.size());
        assertEquals(TraceEventType.TRACE_FINISHED, events.get(0).eventType());
        assertEquals("trace-1", events.get(0).traceId());
        assertEquals(Map.of("status", "ok"), events.get(0).payload().get("result"));
    }

    @Test
    void finishNoArgs() {
        handle.finish();
        assertEquals(1, events.size());
        assertEquals(TraceEventType.TRACE_FINISHED, events.get(0).eventType());
    }

    @Test
    void finishIgnoredWhenClosed() {
        handle.finish();
        handle.finish(); // second call ignored
        assertEquals(1, events.size());
    }

    @Test
    void failWithString() {
        handle.fail("something went wrong");

        assertEquals(1, events.size());
        assertEquals(TraceEventType.TRACE_FAILED, events.get(0).eventType());
        assertEquals("something went wrong", events.get(0).payload().get("error"));
    }

    @Test
    void failWithThrowable() {
        handle.fail(new RuntimeException("test error"));

        assertEquals(1, events.size());
        assertEquals(TraceEventType.TRACE_FAILED, events.get(0).eventType());
        assertEquals("test error", events.get(0).payload().get("error"));
        assertNotNull(events.get(0).payload().get("stack"));
    }

    @Test
    void cancel() {
        handle.cancel();

        assertEquals(1, events.size());
        assertEquals(TraceEventType.TRACE_CANCELLED, events.get(0).eventType());
    }

    @Test
    void startStepSendsEventAndReturnsHandle() {
        StepHandle step = handle.startStep("my-step", "processing");

        assertEquals(1, events.size());
        assertEquals(TraceEventType.STEP_STARTED, events.get(0).eventType());
        assertEquals("my-step", events.get(0).payload().get("name"));
        assertEquals("processing", events.get(0).payload().get("step_type"));
        assertNotNull(step);
        assertNotNull(step.getStepId());
        assertEquals("trace-1", step.getTraceId());
    }

    @Test
    void logSendsEvent() {
        handle.log("test message", LogLevel.WARN, "custom-type", Map.of("key", "val"));

        assertEquals(1, events.size());
        assertEquals(TraceEventType.LOG_EMITTED, events.get(0).eventType());
        assertEquals("test message", events.get(0).payload().get("message"));
        assertEquals("WARN", events.get(0).payload().get("level"));
        assertEquals("custom-type", events.get(0).payload().get("event_type"));
    }

    @Test
    void logDefaultLevel() {
        handle.log("info msg");

        assertEquals(1, events.size());
        assertEquals("INFO", events.get(0).payload().get("level"));
    }
}
