package com.smartness.traceflow;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

class TraceFlowConfigTest {

    @Test
    void builderWithExplicitValues() {
        TraceFlowConfig config = TraceFlowConfig.builder()
                .endpoint("http://custom:3009")
                .apiKey("test-key")
                .source("my-service")
                .async(false)
                .timeout(Duration.ofSeconds(10))
                .maxRetries(5)
                .retryDelayMs(2000)
                .silentErrors(false)
                .build();

        assertEquals("http://custom:3009", config.endpoint());
        assertEquals("test-key", config.apiKey());
        assertEquals("my-service", config.source());
        assertFalse(config.async());
        assertEquals(Duration.ofSeconds(10), config.timeout());
        assertEquals(5, config.maxRetries());
        assertEquals(2000, config.retryDelayMs());
        assertFalse(config.silentErrors());
    }

    @Test
    void builderUsesDefaults() {
        TraceFlowConfig config = TraceFlowConfig.builder().build();

        assertEquals("http://localhost:3009", config.endpoint());
        assertNull(config.apiKey());
        assertEquals("java-app", config.source());
        assertTrue(config.async());
        assertEquals(Duration.ofSeconds(5), config.timeout());
        assertEquals(3, config.maxRetries());
        assertEquals(1000, config.retryDelayMs());
        assertTrue(config.silentErrors());
    }

    @Test
    void fromEnvUsesDefaults() {
        TraceFlowConfig config = TraceFlowConfig.fromEnv();
        assertNotNull(config);
        assertEquals("http://localhost:3009", config.endpoint());
    }
}
