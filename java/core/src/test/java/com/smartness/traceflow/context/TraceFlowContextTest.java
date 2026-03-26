package com.smartness.traceflow.context;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TraceFlowContextTest {

    @AfterEach
    void tearDown() {
        TraceFlowContext.clear();
    }

    @Test
    void initiallyEmpty() {
        assertNull(TraceFlowContext.currentTraceId());
        assertNull(TraceFlowContext.currentStepId());
        assertFalse(TraceFlowContext.hasActiveTrace());
    }

    @Test
    void setAndGet() {
        TraceFlowContext.set("trace-1", "step-1", Map.of("key", "value"));

        assertEquals("trace-1", TraceFlowContext.currentTraceId());
        assertEquals("step-1", TraceFlowContext.currentStepId());
        assertEquals("value", TraceFlowContext.metadata().get("key"));
        assertTrue(TraceFlowContext.hasActiveTrace());
    }

    @Test
    void setTraceIdOnly() {
        TraceFlowContext.set("trace-2");

        assertEquals("trace-2", TraceFlowContext.currentTraceId());
        assertNull(TraceFlowContext.currentStepId());
        assertTrue(TraceFlowContext.hasActiveTrace());
    }

    @Test
    void clearResetsEverything() {
        TraceFlowContext.set("trace-1", "step-1", Map.of("key", "value"));
        TraceFlowContext.clear();

        assertNull(TraceFlowContext.currentTraceId());
        assertNull(TraceFlowContext.currentStepId());
        assertFalse(TraceFlowContext.hasActiveTrace());
    }

    @Test
    void toMapAndRestore() {
        TraceFlowContext.set("trace-1", "step-1", Map.of("env", "test"));
        Map<String, Object> snapshot = TraceFlowContext.toMap();

        TraceFlowContext.clear();
        assertFalse(TraceFlowContext.hasActiveTrace());

        TraceFlowContext.restore(snapshot);
        assertEquals("trace-1", TraceFlowContext.currentTraceId());
        assertEquals("step-1", TraceFlowContext.currentStepId());
        assertEquals("test", TraceFlowContext.metadata().get("env"));
    }

    @Test
    void threadIsolation() throws InterruptedException {
        TraceFlowContext.set("main-trace");

        Thread other = new Thread(() -> {
            assertNull(TraceFlowContext.currentTraceId());
            TraceFlowContext.set("other-trace");
            assertEquals("other-trace", TraceFlowContext.currentTraceId());
        });
        other.start();
        other.join();

        assertEquals("main-trace", TraceFlowContext.currentTraceId());
    }
}
