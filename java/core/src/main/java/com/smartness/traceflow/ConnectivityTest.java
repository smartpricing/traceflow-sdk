package com.smartness.traceflow;

import com.smartness.traceflow.enums.LogLevel;
import com.smartness.traceflow.handles.StepHandle;
import com.smartness.traceflow.handles.TraceHandle;

import java.util.List;
import java.util.Map;

public class ConnectivityTest {

    public static void main(String[] args) {
        System.out.println("=== TraceFlow Java SDK Connectivity Test ===\n");

        TraceFlowConfig config = TraceFlowConfig.fromEnv();
        System.out.println("Endpoint:  " + config.endpoint());
        System.out.println("API Key:   " + (config.apiKey() != null ? config.apiKey().substring(0, Math.min(8, config.apiKey().length())) + "..." : "(none)"));
        System.out.println("Source:    " + config.source());
        System.out.println("Async:     " + config.async());
        System.out.println("Timeout:   " + config.timeout());
        System.out.println();

        TraceFlowClient client = new TraceFlowClient(config);

        try {
            // 1. Start trace
            System.out.print("[1/5] Starting trace... ");
            TraceHandle trace = client.startTrace(StartTraceOptions.builder()
                    .title("Java SDK Connectivity Test")
                    .traceType("connectivity-test")
                    .tags(List.of("java-sdk", "test"))
                    .metadata(Map.of("sdk_version", "1.0.0"))
                    .build());
            System.out.println("OK (traceId: " + trace.getTraceId() + ")");

            // 2. Log
            System.out.print("[2/5] Sending log... ");
            trace.log("Connectivity test started", LogLevel.INFO, "test", Map.of("phase", "start"));
            System.out.println("OK");

            // 3. Start step
            System.out.print("[3/5] Starting step... ");
            StepHandle step = trace.startStep("test-step", "validation",
                    Map.of("test", true), Map.of("step_order", 1));
            System.out.println("OK (stepId: " + step.getStepId() + ")");

            // 4. Finish step
            System.out.print("[4/5] Finishing step... ");
            step.finish(Map.of("validated", true));
            System.out.println("OK");

            // 5. Finish trace
            System.out.print("[5/5] Finishing trace... ");
            trace.finish(Map.of("status", "all_checks_passed"));
            System.out.println("OK");

            // Flush
            client.flush();

            System.out.println("\n=== All checks passed! ===");

        } catch (Exception e) {
            System.err.println("FAILED");
            System.err.println("\nError: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        } finally {
            client.shutdown();
        }
    }
}
