package com.smartness.traceflow;

import java.util.List;
import java.util.Map;

public record StartTraceOptions(
        String traceId,
        String traceType,
        String title,
        String description,
        String owner,
        List<String> tags,
        Map<String, Object> metadata,
        Object params,
        Integer traceTimeoutMs,
        Integer stepTimeoutMs
) {

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String traceId;
        private String traceType;
        private String title;
        private String description;
        private String owner;
        private List<String> tags;
        private Map<String, Object> metadata;
        private Object params;
        private Integer traceTimeoutMs;
        private Integer stepTimeoutMs;

        private Builder() {}

        public Builder traceId(String traceId) { this.traceId = traceId; return this; }
        public Builder traceType(String traceType) { this.traceType = traceType; return this; }
        public Builder title(String title) { this.title = title; return this; }
        public Builder description(String description) { this.description = description; return this; }
        public Builder owner(String owner) { this.owner = owner; return this; }
        public Builder tags(List<String> tags) { this.tags = tags; return this; }
        public Builder metadata(Map<String, Object> metadata) { this.metadata = metadata; return this; }
        public Builder params(Object params) { this.params = params; return this; }
        public Builder traceTimeoutMs(int traceTimeoutMs) { this.traceTimeoutMs = traceTimeoutMs; return this; }
        public Builder stepTimeoutMs(int stepTimeoutMs) { this.stepTimeoutMs = stepTimeoutMs; return this; }

        public StartTraceOptions build() {
            return new StartTraceOptions(
                    traceId, traceType, title, description, owner,
                    tags, metadata, params, traceTimeoutMs, stepTimeoutMs
            );
        }
    }
}
