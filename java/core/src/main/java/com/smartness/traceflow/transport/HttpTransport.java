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

public final class HttpTransport implements Transport {

    private static final Logger log = LoggerFactory.getLogger(HttpTransport.class);

    private final HttpClient httpClient;
    private final String endpoint;
    private final String apiKey;
    private final boolean silentErrors;
    private final ObjectMapper objectMapper;
    private final RetryExecutor retryExecutor;

    public HttpTransport(TraceFlowConfig config) {
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
            retryExecutor.execute(() -> {
                executeRequest(route);
                return null;
            });
        } catch (Exception e) {
            if (silentErrors) {
                log.warn("[TraceFlow HTTP] Error sending event (silenced): {}", e.getMessage());
            } else {
                throw new TraceFlowException("Failed to send event", e);
            }
        }
    }

    private void executeRequest(EventRouter.Route route) throws Exception {
        String json = objectMapper.writeValueAsString(route.payload());

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

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new TraceFlowException("HTTP " + response.statusCode() + ": " + response.body());
        }
    }

    @Override
    public void flush() {
        // Synchronous transport, nothing to flush
    }

    @Override
    public void shutdown() {
        // Nothing to cleanup
    }
}
