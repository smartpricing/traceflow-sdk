package com.smartness.traceflow;

import com.smartness.traceflow.enums.LogLevel;
import com.smartness.traceflow.handles.StepHandle;
import com.smartness.traceflow.handles.TraceHandle;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "TRACEFLOW_URL", matches = ".+")
class ConnectivityTestIT {

    @Test
    void fullLifecycleAgainstLiveServer() {
        TraceFlowConfig config = TraceFlowConfig.fromEnv();
        TraceFlowClient client = new TraceFlowClient(config);

        try {
            TraceHandle trace = client.startTrace(StartTraceOptions.builder()
                    .title("Java SDK Integration Test")
                    .traceType("integration-test")
                    .tags(List.of("java-sdk", "integration"))
                    .build());

            assertNotNull(trace.getTraceId());

            trace.log("Integration test started", LogLevel.INFO);

            StepHandle step = trace.startStep("integration-step", "validation");
            assertNotNull(step.getStepId());

            step.finish(Map.of("validated", true));
            trace.finish(Map.of("status", "passed"));

            client.flush();
        } finally {
            client.shutdown();
        }
    }
}
