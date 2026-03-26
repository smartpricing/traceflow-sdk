package com.smartness.traceflow;

import java.time.Duration;

public record TraceFlowConfig(
        String endpoint,
        String apiKey,
        String source,
        boolean async,
        Duration timeout,
        int maxRetries,
        long retryDelayMs,
        boolean silentErrors
) {

    public static Builder builder() {
        return new Builder();
    }

    public static TraceFlowConfig fromEnv() {
        return builder().build();
    }

    public static final class Builder {
        private String endpoint;
        private String apiKey;
        private String source;
        private Boolean async;
        private Duration timeout;
        private Integer maxRetries;
        private Long retryDelayMs;
        private Boolean silentErrors;

        private Builder() {}

        public Builder endpoint(String endpoint) {
            this.endpoint = endpoint;
            return this;
        }

        public Builder apiKey(String apiKey) {
            this.apiKey = apiKey;
            return this;
        }

        public Builder source(String source) {
            this.source = source;
            return this;
        }

        public Builder async(boolean async) {
            this.async = async;
            return this;
        }

        public Builder timeout(Duration timeout) {
            this.timeout = timeout;
            return this;
        }

        public Builder maxRetries(int maxRetries) {
            this.maxRetries = maxRetries;
            return this;
        }

        public Builder retryDelayMs(long retryDelayMs) {
            this.retryDelayMs = retryDelayMs;
            return this;
        }

        public Builder silentErrors(boolean silentErrors) {
            this.silentErrors = silentErrors;
            return this;
        }

        public TraceFlowConfig build() {
            return new TraceFlowConfig(
                    resolve(endpoint, "TRACEFLOW_URL", "http://localhost:3009"),
                    resolve(apiKey, "TRACEFLOW_API_KEY", null),
                    resolve(source, "TRACEFLOW_SOURCE", "java-app"),
                    resolveBoolean(async, "TRACEFLOW_ASYNC_HTTP", true),
                    resolveDuration(timeout, "TRACEFLOW_TIMEOUT", Duration.ofSeconds(5)),
                    resolveInt(maxRetries, "TRACEFLOW_MAX_RETRIES", 3),
                    resolveLong(retryDelayMs, "TRACEFLOW_RETRY_DELAY", 1000L),
                    resolveBoolean(silentErrors, "TRACEFLOW_SILENT_ERRORS", true)
            );
        }

        private static String resolve(String explicit, String envVar, String defaultValue) {
            if (explicit != null) return explicit;
            String env = System.getenv(envVar);
            return env != null ? env : defaultValue;
        }

        private static boolean resolveBoolean(Boolean explicit, String envVar, boolean defaultValue) {
            if (explicit != null) return explicit;
            String env = System.getenv(envVar);
            return env != null ? Boolean.parseBoolean(env) : defaultValue;
        }

        private static int resolveInt(Integer explicit, String envVar, int defaultValue) {
            if (explicit != null) return explicit;
            String env = System.getenv(envVar);
            return env != null ? Integer.parseInt(env) : defaultValue;
        }

        private static long resolveLong(Long explicit, String envVar, long defaultValue) {
            if (explicit != null) return explicit;
            String env = System.getenv(envVar);
            return env != null ? Long.parseLong(env) : defaultValue;
        }

        private static Duration resolveDuration(Duration explicit, String envVar, Duration defaultValue) {
            if (explicit != null) return explicit;
            String env = System.getenv(envVar);
            if (env == null) return defaultValue;
            try {
                return Duration.ofSeconds(Long.parseLong(env));
            } catch (NumberFormatException e) {
                return defaultValue;
            }
        }
    }
}
