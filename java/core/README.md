# TraceFlow Java SDK

[![Java Version](https://img.shields.io/badge/Java-17+-blue.svg)](https://www.oracle.com/java/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-58%20Passing-brightgreen.svg)](src/test/)

**Production-ready, plain Java distributed tracing SDK with zero framework dependencies.**

TraceFlow Java SDK provides distributed tracing capabilities using an event-sourced architecture. No Spring, no Quarkus — just `java.net.http.HttpClient` and Jackson. Drop it into any Java 17+ project.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Pattern Examples](#pattern-examples)
- [API Reference](#api-reference)
- [Cross-Thread Context Propagation](#cross-thread-context-propagation)
- [Testing](#testing)
- [Performance & Async Transport](#performance--async-transport)
- [Production Best Practices](#production-best-practices)
- [License](#license)

## Features

- **Zero Framework Dependencies** — plain Java 17+, no Spring/Quarkus required
- **Non-Blocking Performance** — async transport with `CompletableFuture`-based event delivery
- **Built-in HTTP Client** — uses `java.net.http.HttpClient`, no Netty or OkHttp needed
- **Thread-Safe Context** — `ThreadLocal`-based context propagation with `toMap()`/`restore()` for cross-thread use
- **Retry Logic** — exponential backoff with configurable retries
- **Silent Error Mode** — tracing never crashes your application
- **Sealed Transport Interface** — Java 17 sealed types constrain transport implementations
- **Immutable Records** — DTOs and config use Java records for safety and clarity
- **Builder Pattern** — fluent API with environment variable fallbacks
- **Comprehensive Tests** — 58 unit tests covering all layers

## Installation

### Maven

```xml
<dependency>
    <groupId>com.smartness</groupId>
    <artifactId>traceflow-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Build from Source

```bash
cd java/core
mvn clean install
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TRACEFLOW_URL` | `http://localhost:3009` | TraceFlow server endpoint |
| `TRACEFLOW_API_KEY` | _(none)_ | API key for authentication |
| `TRACEFLOW_SOURCE` | `java-app` | Service identifier |
| `TRACEFLOW_ASYNC_HTTP` | `true` | Use async (non-blocking) transport |
| `TRACEFLOW_TIMEOUT` | `5` | HTTP timeout in seconds |
| `TRACEFLOW_MAX_RETRIES` | `3` | Max retry attempts |
| `TRACEFLOW_RETRY_DELAY` | `1000` | Base retry delay in ms |
| `TRACEFLOW_SILENT_ERRORS` | `true` | Silence errors instead of throwing |

### Programmatic Configuration

```java
TraceFlowConfig config = TraceFlowConfig.builder()
        .endpoint("http://traceflow.internal:3009")
        .apiKey("your-api-key")
        .source("order-service")
        .async(true)
        .timeout(Duration.ofSeconds(10))
        .maxRetries(3)
        .retryDelayMs(1000)
        .silentErrors(true)
        .build();

TraceFlowClient client = new TraceFlowClient(config);
```

### From Environment (Zero Config)

```java
// Reads all values from env vars, falls back to defaults
TraceFlowClient client = TraceFlowClient.create();
```

## Quick Start

```java
import com.smartness.traceflow.*;
import com.smartness.traceflow.handles.*;
import com.smartness.traceflow.enums.*;

TraceFlowClient client = TraceFlowClient.create();

// Start a trace
TraceHandle trace = client.startTrace(StartTraceOptions.builder()
        .traceType("api_request")
        .title("Process User Request")
        .build());

// Start a step
StepHandle step = trace.startStep("Validate Input", "validation");
step.log("Validation successful");
step.finish(Map.of("valid", true));

// Finish trace
trace.finish(Map.of("success", true));

// Flush pending events (important for async transport)
client.flush();
client.shutdown();
```

## Pattern Examples

### Pattern 1: Try-With-Callback

```java
String result = client.runWithTrace(trace -> {
    StepHandle step = trace.startStep("Database Query");
    String data = repository.fetchData();
    step.finish(Map.of("rows", 42));
    return data;
}, StartTraceOptions.builder()
        .title("Fetch Data")
        .traceType("query")
        .build());
// Trace auto-finishes on success, auto-fails on exception
```

### Pattern 2: Service Layer with Error Handling

```java
public Order createOrder(OrderRequest request) {
    TraceHandle trace = client.startTrace(StartTraceOptions.builder()
            .title("Create Order")
            .traceType("order")
            .tags(List.of("orders", "api"))
            .metadata(Map.of("user_id", request.getUserId()))
            .build());

    StepHandle validation = trace.startStep("Validate Order", "validation");
    try {
        validator.validate(request);
        validation.finish(Map.of("valid", true));
    } catch (ValidationException e) {
        validation.fail(e);
        trace.fail(e);
        throw e;
    }

    StepHandle persist = trace.startStep("Save to Database", "database");
    try {
        Order order = repository.save(request);
        persist.finish(Map.of("order_id", order.getId()));
        trace.finish(Map.of("order_id", order.getId()));
        return order;
    } catch (Exception e) {
        persist.fail(e);
        trace.fail(e);
        throw e;
    }
}
```

### Pattern 3: Static Context Access

```java
import com.smartness.traceflow.context.TraceFlowContext;

// Anywhere in your code during a traced operation
if (TraceFlowContext.hasActiveTrace()) {
    String traceId = TraceFlowContext.currentTraceId();
    logger.info("Processing request [trace={}]", traceId);
}
```

### Pattern 4: Cross-Service Tracing

```java
// Service A: Start trace and pass ID downstream
TraceHandle trace = client.startTrace(StartTraceOptions.builder()
        .title("User Registration")
        .build());

HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("http://service-b/api/process"))
        .header("X-Trace-Id", trace.getTraceId())
        .POST(HttpRequest.BodyPublishers.ofString(payload))
        .build();

httpClient.send(request, HttpResponse.BodyHandlers.ofString());
trace.finish();
```

```java
// Service B: Continue the same trace
String traceId = httpRequest.getHeader("X-Trace-Id");
TraceFlowContext.set(traceId);

TraceHandle trace = client.getCurrentTrace();
StepHandle step = trace.startStep("Process in Service B");
// ...
step.finish();
```

### Pattern 5: Long-Running Batch Jobs

```java
TraceHandle trace = client.startTrace(StartTraceOptions.builder()
        .title("Import Users from CSV")
        .traceType("batch_import")
        .build());

for (int i = 0; i < users.size(); i++) {
    StepHandle step = trace.startStep("Import User #" + i, "import");
    try {
        userService.importUser(users.get(i));
        step.finish();
    } catch (Exception e) {
        step.fail(e);
        trace.log("Failed to import user #" + i, LogLevel.ERROR);
    }
}

trace.finish(Map.of("imported", users.size()));
client.flush();
```

## API Reference

### TraceFlowClient

```java
// Create with env vars
TraceFlowClient client = TraceFlowClient.create();

// Create with config
TraceFlowClient client = new TraceFlowClient(config);

// Start trace
TraceHandle trace = client.startTrace();
TraceHandle trace = client.startTrace(StartTraceOptions.builder()
        .traceId("custom-id")       // optional, auto-generated if null
        .traceType("process_type")   // optional
        .title("Human readable")     // optional
        .description("Details")      // optional
        .owner("team-name")          // optional
        .tags(List.of("a", "b"))     // optional
        .metadata(Map.of("k", "v")) // optional
        .params(inputData)           // optional
        .traceTimeoutMs(5000)        // optional
        .stepTimeoutMs(2000)         // optional
        .build());

// Run with automatic finish/fail
T result = client.runWithTrace(trace -> { ... });

// Get current trace from ThreadLocal context
TraceHandle trace = client.getCurrentTrace(); // null if no active trace

// Context-aware convenience methods
StepHandle step = client.startStep("name");  // null if no active trace
client.log("message", LogLevel.INFO);

// Lifecycle
client.flush();    // flush pending async events
client.shutdown(); // flush + cleanup
```

### TraceHandle

```java
trace.finish();                              // finish with no result
trace.finish(Map.of("key", "value"));       // finish with result
trace.finish(result, metadata);              // finish with result + metadata
trace.fail("error message");                 // fail with string
trace.fail(exception);                       // fail with throwable (captures stack)
trace.cancel();                              // cancel trace

StepHandle step = trace.startStep("name");
StepHandle step = trace.startStep("name", "stepType");
StepHandle step = trace.startStep("name", "stepType", input, metadata);

trace.log("message");                        // log at INFO
trace.log("message", LogLevel.WARN);        // log at level
trace.log("message", LogLevel.ERROR, "event_type", details);

String id = trace.getTraceId();
```

### StepHandle

```java
step.finish();                               // finish with no output
step.finish(output);                         // finish with output
step.finish(output, metadata);               // finish with output + metadata
step.fail("error message");                  // fail with string
step.fail(exception);                        // fail with throwable (captures stack)

step.log("message");                         // log at INFO
step.log("message", LogLevel.WARN);         // log at level
step.log("message", LogLevel.ERROR, "event_type", details);

String id = step.getStepId();
String traceId = step.getTraceId();
```

### TraceFlowContext

```java
TraceFlowContext.set("trace-id");                        // set trace only
TraceFlowContext.set("trace-id", "step-id", metadata);  // set full context

String traceId = TraceFlowContext.currentTraceId();      // nullable
String stepId = TraceFlowContext.currentStepId();        // nullable
boolean active = TraceFlowContext.hasActiveTrace();

// Cross-thread propagation
Map<String, Object> snapshot = TraceFlowContext.toMap();
// In another thread:
TraceFlowContext.restore(snapshot);

TraceFlowContext.clear();                                // cleanup
```

## Cross-Thread Context Propagation

`TraceFlowContext` uses `ThreadLocal` — context does not automatically propagate to new threads. Use `toMap()`/`restore()` explicitly:

```java
// Capture context before spawning thread
Map<String, Object> ctx = TraceFlowContext.toMap();

executor.submit(() -> {
    TraceFlowContext.restore(ctx);
    try {
        // Context available here
        StepHandle step = client.startStep("Background Work");
        // ...
        step.finish();
    } finally {
        TraceFlowContext.clear();
    }
});
```

## Testing

```bash
# Run unit tests (58 tests)
mvn test

# Run integration tests (requires live TraceFlow server)
TRACEFLOW_URL=http://localhost:3009 TRACEFLOW_API_KEY=your-key \
  mvn verify -Dit.test=ConnectivityTestIT

# Connectivity test CLI
mvn exec:java -Dexec.mainClass="com.smartness.traceflow.ConnectivityTest"
```

### Test Coverage

| Layer | Tests | Coverage |
|---|---|---|
| Config | 3 | Builder, defaults, env resolution |
| Context | 6 | Set/get, clear, toMap/restore, thread isolation |
| EventRouter | 10 | All 8 event types, null filtering, idempotency |
| RetryExecutor | 6 | Success, retry, max retries, async variants |
| HttpTransport | 3 | Silent errors, error throwing, lifecycle |
| AsyncHttpTransport | 3 | Silent errors, multi-event flush, lifecycle |
| TraceHandle | 10 | Finish, fail, cancel, steps, logging, idempotent close |
| StepHandle | 8 | Finish, fail, logging, idempotent close |
| TraceFlowClient | 9 | Start trace, context, options, runWithTrace, error propagation |

## Performance & Async Transport

By default, the SDK uses **non-blocking async HTTP** (`CompletableFuture`-based):

| Transport | Overhead per Event | Blocking |
|---|---|---|
| **Async** (default) | ~1-2ms | No |
| Sync | ~50-200ms | Yes |

### How Async Works

1. `send()` returns immediately, HTTP call runs on `ForkJoinPool.commonPool()`
2. Retries with exponential backoff happen asynchronously
3. `flush()` waits for all pending futures to complete
4. `shutdown()` calls `flush()` automatically

### Configuration

```java
// Async (default, recommended)
TraceFlowConfig.builder().async(true).build();

// Sync (for debugging or guaranteed delivery)
TraceFlowConfig.builder().async(false).build();
```

## Production Best Practices

1. **Always enable silent errors** — tracing should never crash your app
   ```java
   TraceFlowConfig.builder().silentErrors(true).build()
   ```

2. **Call `flush()` before shutdown** — ensures async events are delivered
   ```java
   Runtime.getRuntime().addShutdownHook(new Thread(client::shutdown));
   ```

3. **Use environment variables** — keep config out of code
   ```bash
   export TRACEFLOW_URL=http://traceflow:3009
   export TRACEFLOW_API_KEY=your-key
   export TRACEFLOW_SOURCE=my-service
   ```

4. **Propagate context explicitly** across threads with `toMap()`/`restore()`

5. **Always clear context** in `finally` blocks to prevent ThreadLocal leaks

## License

MIT License - see [LICENSE](../../LICENSE) file for details.

Copyright (c) 2025 Smartness
