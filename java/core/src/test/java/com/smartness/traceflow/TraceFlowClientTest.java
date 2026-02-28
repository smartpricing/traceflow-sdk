package com.smartness.traceflow;

import com.smartness.traceflow.context.TraceFlowContext;
import com.smartness.traceflow.handles.TraceHandle;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

class TraceFlowClientTest {

    private TraceFlowClient client;

    @BeforeEach
    void setUp() {
        // Use silent errors so tests don't fail on network
        client = new TraceFlowClient(TraceFlowConfig.builder()
                .endpoint("http://localhost:19999") // non-existent
                .silentErrors(true)
                .async(false)
                .timeout(Duration.ofSeconds(1))
                .maxRetries(0)
                .build());
    }

    @AfterEach
    void tearDown() {
        TraceFlowContext.clear();
        client.shutdown();
    }

    @Test
    void startTraceReturnsHandle() {
        TraceHandle handle = client.startTrace();
        assertNotNull(handle);
        assertNotNull(handle.getTraceId());
        assertFalse(handle.getTraceId().isEmpty());
    }

    @Test
    void startTraceSetsContext() {
        TraceHandle handle = client.startTrace();
        assertTrue(TraceFlowContext.hasActiveTrace());
        assertEquals(handle.getTraceId(), TraceFlowContext.currentTraceId());
    }

    @Test
    void startTraceWithOptions() {
        TraceHandle handle = client.startTrace(StartTraceOptions.builder()
                .traceId("custom-id")
                .title("Test Trace")
                .traceType("unit-test")
                .build());

        assertEquals("custom-id", handle.getTraceId());
    }

    @Test
    void getCurrentTraceReturnsNullWithoutContext() {
        assertNull(client.getCurrentTrace());
    }

    @Test
    void getCurrentTraceReturnsHandleWithContext() {
        client.startTrace();
        TraceHandle current = client.getCurrentTrace();
        assertNotNull(current);
    }

    @Test
    void startStepReturnsNullWithoutTrace() {
        assertNull(client.startStep("test"));
    }

    @Test
    void runWithTraceExecutesCallback() {
        String result = client.runWithTrace(trace -> {
            assertNotNull(trace);
            return "done";
        });
        assertEquals("done", result);
    }

    @Test
    void runWithTracePropagatesException() {
        RuntimeException expected = new RuntimeException("test error");
        assertThrows(RuntimeException.class, () ->
                client.runWithTrace(trace -> { throw expected; })
        );
    }

    @Test
    void createFromDefaults() {
        TraceFlowClient defaultClient = TraceFlowClient.create(
                TraceFlowConfig.builder().silentErrors(true).build());
        assertNotNull(defaultClient);
        defaultClient.shutdown();
    }
}
