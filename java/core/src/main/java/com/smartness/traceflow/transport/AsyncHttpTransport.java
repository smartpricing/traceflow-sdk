package com.smartness.traceflow.transport;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartness.traceflow.TraceFlowConfig;
import com.smartness.traceflow.dto.TraceEvent;
import com.smartness.traceflow.exception.TraceFlowException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

public final class AsyncHttpTransport implements Transport {

    private static final Logger log = LoggerFactory.getLogger(AsyncHttpTransport.class);

    private final HttpClient httpClient;
    private final String endpoint;
    private final String apiKey;
    private final boolean silentErrors;
    private final ObjectMapper objectMapper;
    private final RetryExecutor retryExecutor;
    private final Queue<CompletableFuture<?>> futures = new ConcurrentLinkedQueue<>();
    private final AtomicInteger eventCount = new AtomicInteger(0);

    /**
     * Last pending request per entity order key. Requests for the same entity
     * (e.g. a step's create then update) are chained so an update is never sent
     * before its create completes, which would 404 on the server. Independent
     * entities — and logs, which use a null key — still run concurrently.
     */
    private final Map<String, CompletableFuture<?>> chains = new ConcurrentHashMap<>();

    public AsyncHttpTransport(TraceFlowConfig config) {
        this.endpoint = config.endpoint();
        this.apiKey = config.apiKey();
        this.silentErrors = config.silentErrors();
        this.objectMapper = new ObjectMapper();
        this.retryExecutor = new RetryExecutor(config.maxRetries(), config.retryDelayMs());
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(config.timeout())
                .build();
    }

    @Override
    public void send(TraceEvent event) {
        try {
            EventRouter.Route route = EventRouter.route(event);
            String orderKey = orderKey(event);

            // The request (with retries and silent-error handling) is wrapped in a
            // supplier so it can be deferred until any earlier request for the same
            // entity has completed.
            Supplier<CompletableFuture<?>> request = () -> retryExecutor.executeAsync(() -> executeRequest(route))
                    .thenRun(() -> eventCount.incrementAndGet())
                    .exceptionally(ex -> {
                        if (silentErrors) {
                            log.warn("[TraceFlow Async] Error sending event (silenced): {}", ex.getMessage());
                        } else {
                            throw new TraceFlowException("Failed to send event", ex);
                        }
                        return null;
                    });

            final CompletableFuture<?> future;
            if (orderKey == null) {
                future = request.get();
            } else {
                // Atomically chain behind the previous request for this entity.
                // handle(...) detaches so the next request still runs even if the
                // previous one failed; the previous future stays in `futures` so its
                // outcome is still observed at flush time.
                future = chains.compute(orderKey, (key, previous) ->
                        previous == null
                                ? request.get()
                                : previous.handle((r, ex) -> null).thenCompose(ignored -> request.get()));
            }

            futures.add(future);
            future.whenComplete((r, e) -> futures.remove(future));
        } catch (Exception e) {
            if (silentErrors) {
                log.warn("[TraceFlow Async] Error sending event (silenced): {}", e.getMessage());
            } else {
                throw new TraceFlowException("Failed to send event", e);
            }
        }
    }

    /**
     * Order key identifying the entity a request belongs to, or null for events
     * that need no ordering (logs).
     */
    private static String orderKey(TraceEvent event) {
        return switch (event.eventType()) {
            case TRACE_STARTED, TRACE_FINISHED, TRACE_FAILED, TRACE_CANCELLED ->
                    "trace:" + event.traceId();
            case STEP_STARTED, STEP_FINISHED, STEP_FAILED ->
                    "step:" + event.traceId() + ":" + event.stepId();
            case LOG_EMITTED -> null;
        };
    }

    private CompletableFuture<Void> executeRequest(EventRouter.Route route) {
        String json;
        try {
            json = objectMapper.writeValueAsString(route.payload());
        } catch (Exception e) {
            return CompletableFuture.failedFuture(new TraceFlowException("Serialization failed", e));
        }

        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(endpoint + route.path()))
                .header("Content-Type", "application/json");

        if (apiKey != null) {
            requestBuilder.header("X-API-Key", apiKey);
        }

        HttpRequest request = switch (route.method()) {
            case "POST" -> requestBuilder.POST(HttpRequest.BodyPublishers.ofString(json)).build();
            case "PATCH" -> requestBuilder.method("PATCH", HttpRequest.BodyPublishers.ofString(json)).build();
            default -> throw new TraceFlowException("Unsupported HTTP method: " + route.method());
        };

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenAccept(response -> {
                    if (response.statusCode() >= 400) {
                        throw new TraceFlowException("HTTP " + response.statusCode() + ": " + response.body());
                    }
                });
    }

    @Override
    public void flush() {
        if (futures.isEmpty()) return;

        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            log.debug("[TraceFlow Async] Flushed {} events", eventCount.get());
            futures.clear();
            // All requests have settled; drop references to per-entity chains so the
            // map does not grow for the lifetime of the process.
            chains.clear();
            eventCount.set(0);
        } catch (Exception e) {
            if (silentErrors) {
                log.warn("[TraceFlow Async] Error during flush (silenced): {}", e.getMessage());
            } else {
                throw new TraceFlowException("Error during flush", e);
            }
        }
    }

    @Override
    public void shutdown() {
        log.debug("[TraceFlow Async] Shutting down async transport...");
        flush();
    }
}
