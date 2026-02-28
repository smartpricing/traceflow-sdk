package com.smartness.traceflow.transport;

import com.smartness.traceflow.TraceFlowConfig;
import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.TraceEventType;
import com.smartness.traceflow.exception.TraceFlowException;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class HttpTransportTest {

    @Test
    void sendWithSilentErrorsDoesNotThrow() {
        HttpTransport transport = new HttpTransport(TraceFlowConfig.builder()
                .endpoint("http://localhost:19999")
                .silentErrors(true)
                .timeout(Duration.ofSeconds(1))
                .maxRetries(0)
                .build());

        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_STARTED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of());

        assertDoesNotThrow(() -> transport.send(event));
    }

    @Test
    void sendWithoutSilentErrorsThrows() {
        HttpTransport transport = new HttpTransport(TraceFlowConfig.builder()
                .endpoint("http://localhost:19999")
                .silentErrors(false)
                .timeout(Duration.ofSeconds(1))
                .maxRetries(0)
                .build());

        TraceEvent event = new TraceEvent("ev-1", TraceEventType.TRACE_STARTED,
                "trace-1", "2026-01-01T00:00:00Z", "test", Map.of());

        assertThrows(TraceFlowException.class, () -> transport.send(event));
    }

    @Test
    void flushAndShutdownDoNotThrow() {
        HttpTransport transport = new HttpTransport(TraceFlowConfig.builder()
                .endpoint("http://localhost:19999")
                .silentErrors(true)
                .build());

        assertDoesNotThrow(transport::flush);
        assertDoesNotThrow(transport::shutdown);
    }
}
