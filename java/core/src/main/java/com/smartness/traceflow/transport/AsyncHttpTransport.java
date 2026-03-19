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
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;

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
            CompletableFuture<?> future = retryExecutor.executeAsync(() -> executeRequest(route))
                    .thenRun(() -> eventCount.incrementAndGet())
                    .exceptionally(ex -> {
                        if (silentErrors) {
                            log.warn("[TraceFlow Async] Error sending event (silenced): {}", ex.getMessage());
                        } else {
                            throw new TraceFlowException("Failed to send event", ex);
                        }
                        return null;
                    });
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
