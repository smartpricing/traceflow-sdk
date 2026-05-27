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
        // trace_id must be a valid UUID — the SDK uses it directly in server URL
        // paths (and UUID-typed columns), so non-UUID values are replaced.
        String customId = "550e8400-e29b-41d4-a716-446655440000";
        TraceHandle handle = client.startTrace(StartTraceOptions.builder()
                .traceId(customId)
                .title("Test Trace")
                .traceType("unit-test")
                .build());

        assertEquals(customId, handle.getTraceId());
    }

    @Test
    void startTraceReplacesInvalidTraceIdWithValidUuid() {
        TraceHandle handle = client.startTrace(StartTraceOptions.builder()
                .traceId("not-a-uuid")
                .build());

        assertNotEquals("not-a-uuid", handle.getTraceId());
        assertTrue(UuidValidator.isValid(handle.getTraceId()),
                "invalid trace_id should be replaced with a valid UUID");
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

    @Test
    void shutdownClosesUnclosedTraces() {
        TraceHandle trace = client.startTrace();
        assertFalse(trace.isClosed());

        client.shutdown();

        assertTrue(trace.isClosed());
    }

    @Test
    void shutdownDoesNotDoubleCloseExplicitlyClosedTraces() {
        TraceHandle trace = client.startTrace();
        trace.finish();
        assertTrue(trace.isClosed());

        // Should not throw or produce extra events
        client.shutdown();

        assertTrue(trace.isClosed());
    }

    @Test
    void disabledClientUsesNullTransportAndStillExposesFullSurface() {
        TraceFlowClient disabled = new TraceFlowClient(TraceFlowConfig.builder()
                .enabled(false)
                // No endpoint required — NullTransport ignores it.
                .build());

        try {
            TraceHandle trace = disabled.startTrace();
            assertNotNull(trace);
            assertNotNull(trace.getTraceId());

            // All operations are no-ops but must not throw.
            assertDoesNotThrow(() -> disabled.startStep("step"));
            assertDoesNotThrow(() -> disabled.log("hello"));
            assertDoesNotThrow(disabled::flush);
            assertDoesNotThrow(() -> trace.finish());
        } finally {
            disabled.shutdown();
        }
    }

    @Test
    void explicitlyClosedTraceRemovedFromRegistry() {
        TraceHandle trace = client.startTrace();
        trace.finish(); // triggers onClose → removed from activeTraces

        // shutdown should have nothing to close
        client.shutdown(); // no exception, no double-close
        assertTrue(trace.isClosed());
    }
}
