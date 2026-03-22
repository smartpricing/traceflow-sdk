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

class StepHandleTest {

    private List<TraceEvent> events;
    private StepHandle handle;

    @BeforeEach
    void setUp() {
        events = new ArrayList<>();
        handle = new StepHandle("step-1", "trace-1", "test-source", events::add);
    }

    @Test
    void getIds() {
        assertEquals("step-1", handle.getStepId());
        assertEquals("trace-1", handle.getTraceId());
    }

    @Test
    void finishSendsEvent() {
        handle.finish(Map.of("result", "done"));

        assertEquals(1, events.size());
        assertEquals(TraceEventType.STEP_FINISHED, events.get(0).eventType());
        assertEquals("step-1", events.get(0).stepId());
        assertEquals("trace-1", events.get(0).traceId());
    }

    @Test
    void finishNoArgs() {
        handle.finish();
        assertEquals(1, events.size());
        assertEquals(TraceEventType.STEP_FINISHED, events.get(0).eventType());
    }

    @Test
    void finishIgnoredWhenClosed() {
        handle.finish();
        handle.finish();
        assertEquals(1, events.size());
    }

    @Test
    void failWithString() {
        handle.fail("step error");

        assertEquals(1, events.size());
        assertEquals(TraceEventType.STEP_FAILED, events.get(0).eventType());
        assertEquals("step error", events.get(0).payload().get("error"));
    }

    @Test
    void failWithThrowable() {
        handle.fail(new RuntimeException("step exception"));

        assertEquals(1, events.size());
        assertEquals(TraceEventType.STEP_FAILED, events.get(0).eventType());
        assertEquals("step exception", events.get(0).payload().get("error"));
        assertNotNull(events.get(0).payload().get("stack"));
    }

    @Test
    void logSendsEvent() {
        handle.log("step log", LogLevel.ERROR, "step-event", Map.of("detail", 42));

        assertEquals(1, events.size());
        assertEquals(TraceEventType.LOG_EMITTED, events.get(0).eventType());
        assertEquals("step log", events.get(0).payload().get("message"));
        assertEquals("ERROR", events.get(0).payload().get("level"));
        assertEquals("step-1", events.get(0).stepId());
    }

    @Test
    void logDefaultLevel() {
        handle.log("default level");

        assertEquals("INFO", events.get(0).payload().get("level"));
    }

    @Test
    void isClosedReturnsFalseInitially() {
        assertFalse(handle.isClosed());
    }

    @Test
    void isClosedReturnsTrueAfterFinish() {
        handle.finish();
        assertTrue(handle.isClosed());
    }

    @Test
    void isClosedReturnsTrueAfterFail() {
        handle.fail("error");
        assertTrue(handle.isClosed());
    }

    @Test
    void closeAutoFailsIfNotClosed() {
        handle.close();

        assertTrue(handle.isClosed());
        assertEquals(1, events.size());
        assertEquals(TraceEventType.STEP_FAILED, events.get(0).eventType());
        assertEquals("Step not explicitly closed", events.get(0).payload().get("error"));
    }

    @Test
    void closeIsNoopIfAlreadyClosed() {
        handle.finish();
        handle.close(); // should not send another event

        assertEquals(1, events.size());
    }
}
