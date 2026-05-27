package com.smartness.traceflow.transport;

import com.smartness.traceflow.TraceFlowConfig;
import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.enums.TraceEventType;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Regression test for the per-entity ordering guarantee in the async transport.
 *
 * <p>A step's update (PATCH) must never be sent before its create (POST) has
 * completed; otherwise the server can receive the PATCH for a step it has not
 * yet persisted and return 404. The local server delays the create response so
 * that, if requests were fired concurrently (the old behavior), the update would
 * arrive during that window and be recorded first.
 */
class AsyncHttpTransportOrderingTest {

    private static final String TRACE_ID = "11111111-1111-1111-1111-111111111111";
    private static final String STEP_ID = "22222222-2222-2222-2222-222222222222";
    private static final long CREATE_DELAY_MS = 300;

    private HttpServer server;
    private final List<String> received = new CopyOnWriteArrayList<>();
    private int port;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // Multiple threads so the server can handle a concurrent update while the
        // create response is still delayed.
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.createContext("/", exchange -> {
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath();
            exchange.getRequestBody().readAllBytes();

            if ("POST".equals(method) && "/api/v1/steps".equals(path)) {
                // Record the create only after the delay: an update that arrives
                // concurrently would be recorded first.
                sleep(CREATE_DELAY_MS);
                received.add("POST /steps");
            } else if ("PATCH".equals(method) && path.startsWith("/api/v1/steps/")) {
                received.add("PATCH /steps");
            }

            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        port = server.getAddress().getPort();
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void stepUpdateIsNotSentBeforeItsCreateCompletes() {
        AsyncHttpTransport transport = new AsyncHttpTransport(TraceFlowConfig.builder()
                .endpoint("http://127.0.0.1:" + port)
                .silentErrors(true)
                .async(true)
                .timeout(Duration.ofSeconds(5))
                .maxRetries(0)
                .build());

        transport.send(new TraceEvent("e1", TraceEventType.STEP_STARTED, TRACE_ID,
                "2026-01-01T00:00:00Z", "test",
                Map.of("name", "step"), STEP_ID));
        transport.send(new TraceEvent("e2", TraceEventType.STEP_FINISHED, TRACE_ID,
                "2026-01-01T00:00:00Z", "test",
                Map.of("output", "ok"), STEP_ID));

        transport.flush();

        assertEquals(List.of("POST /steps", "PATCH /steps"), received,
                "step update must be sent only after its create completes");
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
