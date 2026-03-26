package com.smartness.traceflow.context;

import java.util.HashMap;
import java.util.Map;

public final class TraceFlowContext {

    private static final ThreadLocal<String> traceId = new ThreadLocal<>();
    private static final ThreadLocal<String> stepId = new ThreadLocal<>();
    private static final ThreadLocal<Map<String, Object>> metadata = ThreadLocal.withInitial(HashMap::new);

    private TraceFlowContext() {}

    public static void set(String traceId, String stepId, Map<String, Object> metadata) {
        TraceFlowContext.traceId.set(traceId);
        TraceFlowContext.stepId.set(stepId);
        TraceFlowContext.metadata.set(metadata != null ? new HashMap<>(metadata) : new HashMap<>());
    }

    public static void set(String traceId) {
        set(traceId, null, null);
    }

    public static String currentTraceId() {
        return traceId.get();
    }

    public static String currentStepId() {
        return stepId.get();
    }

    public static Map<String, Object> metadata() {
        return metadata.get();
    }

    public static void clear() {
        traceId.remove();
        stepId.remove();
        metadata.remove();
    }

    public static boolean hasActiveTrace() {
        return traceId.get() != null;
    }

    public static Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("trace_id", traceId.get());
        map.put("step_id", stepId.get());
        map.put("metadata", new HashMap<>(metadata.get()));
        return map;
    }

    @SuppressWarnings("unchecked")
    public static void restore(Map<String, Object> data) {
        traceId.set((String) data.get("trace_id"));
        stepId.set((String) data.get("step_id"));
        Object meta = data.get("metadata");
        metadata.set(meta instanceof Map ? new HashMap<>((Map<String, Object>) meta) : new HashMap<>());
    }
}
