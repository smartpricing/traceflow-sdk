package com.smartness.traceflow.transport;

import com.smartness.traceflow.TraceFlowConfig;
import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.TraceEventType;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AsyncHttpTransportTest {

    @Test
    void sendWithSilentErrorsDoesNotThrow() {
        AsyncHttpTransport transport = new AsyncHttpTransport(TraceFlowConfig.builder()
                .endpoint("http://localhost:19999")
                .silentErrors(true)
                .timeout(Duration.ofSeconds(1))
                .maxRetries(0)
                .build());

        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_STARTED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of());

        assertDoesNotThrow(() -> transport.send(event));
        assertDoesNotThrow(transport::flush);
    }

    @Test
    void flushAndShutdownDoNotThrow() {
        AsyncHttpTransport transport = new AsyncHttpTransport(TraceFlowConfig.builder()
                .endpoint("http://localhost:19999")
                .silentErrors(true)
                .build());

        assertDoesNotThrow(transport::flush);
        assertDoesNotThrow(transport::shutdown);
    }

    @Test
    void sendMultipleEventsAndFlush() {
        AsyncHttpTransport transport = new AsyncHttpTransport(TraceFlowConfig.builder()
                .endpoint("http://localhost:19999")
                .silentErrors(true)
                .timeout(Duration.ofSeconds(1))
                .maxRetries(0)
                .build());

        for (int i = 0; i < 5; i++) {
            TraceEvent event = new TraceEvent("ev-" + i, TraceEventType.LOG_EMITTED,
                    "trace-1", "2026-01-01T00:00:00Z", "test",
                    Map.of("message", "log " + i, "level", "INFO"));
            transport.send(event);
        }

        assertDoesNotThrow(transport::flush);
        transport.shutdown();
    }
}
