package com.smartness.traceflow.transport;

import com.smartness.traceflow.TraceFlowConfig;
import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.TraceEventType;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the transport retry policy against a real server:
 *  - 4xx client errors are not retried
 *  - 5xx server errors are retried up to maxRetries
 *  - 409 Conflict is benign (entity already exists) and does not surface as error
 */
class RetryPolicyTest {

    private static final int MAX_RETRIES = 3;

    private HttpServer server;
    private final AtomicInteger requests = new AtomicInteger(0);

    private void startServer(int status) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void clientErrorIsNotRetried() throws IOException {
        startServer(404);
        send(transport(true));
        assertEquals(1, requests.get(), "4xx must not be retried");
    }

    @Test
    void serverErrorIsRetried() throws IOException {
        startServer(503);
        send(transport(true));
        assertEquals(1 + MAX_RETRIES, requests.get(), "5xx must be retried up to maxRetries");
    }

    @Test
    void conflictIsBenign() throws IOException {
        startServer(409);
        // silentErrors=false: a genuine failure would throw from send(). A benign
        // 409 must be swallowed and not retried.
        HttpTransport transport = transport(false);
        assertDoesNotThrow(() -> send(transport));
        assertEquals(1, requests.get(), "409 must not be retried");
    }

    private HttpTransport transport(boolean silentErrors) {
        return new HttpTransport(TraceFlowConfig.builder()
                .endpoint("http://127.0.0.1:" + server.getAddress().getPort())
                .async(false)
                .silentErrors(silentErrors)
                .maxRetries(MAX_RETRIES)
                .retryDelayMs(1)
                .timeout(Duration.ofSeconds(5))
                .build());
    }

    private void send(HttpTransport transport) {
        transport.send(new TraceEvent("e1", TraceEventType.TRACE_STARTED,
                "11111111-1111-1111-1111-111111111111",
                "2026-01-01T00:00:00Z", "test", Map.of("title", "t")));
    }
}
