# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### 2.6.2 (2026-03-27)


### Bug Fixes

* validate and auto-replace invalid UUIDs in all SDKs ([1161ff3](https://github.com-sp/smartpricing/traceflow-sdk/commit/1161ff3ec9b1a3fe616ceb80cb1a29d7f385723b))

## 2.3.4 (2026-02-28) - Remove Queue Integration

### Removed

- **Queue/job context propagation helpers** (`serializeTraceContext`, `restoreTraceContext`, `createTracedProcessor`) - These were ported from the PHP/Laravel SDK where they integrate with Laravel's built-in queue system. In JS there's no equivalent framework convention, and the serialize/deserialize logic is trivial enough to not warrant dedicated helpers. This also keeps the SDK fully stateless as intended.

## 2.3.3 (2026-02-19) - Add composer test:connectivity Script

### New Features

- **`composer test:connectivity`** - Standalone connectivity test script that verifies the full trace lifecycle (connectivity, auth, trace, step, log) against a real TraceFlow service
- Requires only `TRACEFLOW_URL` and `TRACEFLOW_API_KEY` environment variables
- Color-coded output with per-step OK/FAILED reporting

## 2.3.2 (2026-02-19) - Fix traceflow:test Command

### Bug Fixes

- **traceflow:test command** now properly detects and reports failures instead of always showing "All checks passed"
- Connectivity check no longer treats HTTP 404 as success
- Authentication errors (401/403) are caught and reported with actionable guidance
- Replaced fire-and-forget async SDK calls with direct synchronous HTTP requests for reliable diagnostics
- Added early validation for missing `TRACEFLOW_API_KEY`
- API key preview shown in output for easier debugging

## 2.3.0 (2026-02-18) - Context Propagation & Queue Support (PHP/Laravel)

### New Features

#### Static Context Store (`TraceFlowContext`)
- **`TraceFlowContext::currentTraceId()`** - Access current trace ID from anywhere without DI
- **`TraceFlowContext::set()` / `clear()`** - Managed automatically by middleware and SDK
- **`toArray()` / `restore()`** - Serialize/deserialize context for queue propagation

#### Automatic Queue Context Propagation (`TracedJob` trait)
- **`TracedJob` trait** - Add to any Laravel job for automatic trace context capture
- **`RestoreTraceContext` middleware** - Restores context before job `handle()` runs
- **Infinite chaining** - Job A dispatching Job B dispatching Job C all share the same trace

#### SDK Enhancements
- **`setCurrentTraceId()`** - Public method for queue middleware to restore SDK state
- **`getCurrentTrace()`** - Now falls back to `TraceFlowContext` when SDK state is empty

### Changes

- **Renamed `TRACEFLOW_ENDPOINT` to `TRACEFLOW_URL`** - Environment variable for API endpoint
- **Middleware** now sets/clears `TraceFlowContext` automatically
- **Config** added `queue.propagate_context` option

### 2.2.1 (2025-12-22)

## 2.2.0 (2025-12-21) - Custom Timeouts & Simplified Tracing

### ✨ New Features

#### Custom Trace & Step Timeouts
- **`trace_timeout_ms`** - Set custom timeout for entire trace
  - Overrides service default timeout
  - Specified in milliseconds
  - Service auto-closes trace after timeout
- **`step_timeout_ms`** - Set custom timeout for each step in trace
  - Overrides service default step timeout
  - Specified in milliseconds
  - Service marks steps as timed out

### 🔥 Breaking Changes

#### Removed Nested Traces Support
- **Removed `parent_trace_id`** - No longer supported
  - Nested/hierarchical traces are not supported
  - Use `getTrace(traceId)` to continue existing traces across services
  - Single flat trace model simplifies architecture
- **Updated cross-service pattern**:
  ```typescript
  // Before (v2.1.0 - NOT SUPPORTED)
  const childTrace = await sdk.startTrace({
    parent_trace_id: parentTraceId
  });

  // After (v2.2.0)
  const trace = await sdk.getTrace(traceId); // Retrieve existing trace
  await trace.startStep({ name: 'Continue Process' });
  ```

### 🎯 Use Cases
```typescript
// Quick API call (5 seconds)
await sdk.startTrace({
  title: 'Quick API Call',
  trace_timeout_ms: 5000,
  step_timeout_ms: 2000,
});

// Long batch job (10 minutes)
await sdk.startTrace({
  title: 'Data Export',
  trace_timeout_ms: 600000,
  step_timeout_ms: 120000,
});

// Cross-service tracing (no parent_trace_id)
const trace = await sdk.getTrace(traceId);
await trace.startStep({ name: 'Service B Step' });
```

### 📚 Documentation
- **New Example**: `examples/custom-timeouts.ts`
  - Quick tasks (5s timeout)
  - Long-running processes (10m timeout)
  - Real-time processing (1s timeout)
  - ML training (2h timeout)
  - Default timeout behavior
- **Updated README**: 
  - Timeout documentation in `startTrace()` section
  - Cross-service tracing patterns (no nested traces)
  - Removed distributed tracing references
- **PHP/Laravel SDK**: Updated with same changes

### 🔧 Implementation
- Added `trace_timeout_ms` and `step_timeout_ms` to `StartTraceOptions`
- Updated `HTTPTracePayload` to include timeout fields
- HTTP transport sends timeout values in trace creation
- Removed `parent_trace_id` from `TraceEvent`, `StartTraceOptions`, `TraceContext`
- PHP/Laravel SDK updated with same changes

### 💡 Timeout Guidelines
- **Quick API Calls**: 5-30 seconds
- **Background Jobs**: 1-5 minutes
- **Batch Processing**: 10-60 minutes
- **Long-Running Tasks**: 1-24 hours
- **Default (unspecified)**: Service-level configuration

### 📦 Migration from v2.1.0

If you were using `parent_trace_id`:

```typescript
// Before (v2.1.0)
const childTrace = await sdk.startTrace({
  parent_trace_id: parentTraceId
});

// After (v2.2.0)
const trace = await sdk.getTrace(parentTraceId);
```

## 2.1.0 (2025-12-18) - Trace Retrieval & Hybrid Patterns

### ✨ New Features

#### Trace Retrieval
- **`getTrace(traceId)`** - Retrieve existing trace by ID
  - Makes HTTP call to `/api/v1/traces/{id}/state`
  - Updates internal context
  - Returns ready-to-use `TraceHandle`
  - Only works with HTTP transport
- **`getCurrentTrace()`** - Get trace from context (no HTTP call)
  - Fast, context-based access
  - Works across async boundaries
  - Returns `null` if no active trace
- **`heartbeat(traceId?)`** - Send heartbeat to prevent timeout
  - Updates `last_activity_at` on service
  - Prevents TraceCleaner from auto-closing
  - Useful for long-running processes

#### Hybrid Pattern Support
- **Context + Manual Access** - Mix both patterns seamlessly
- **Idempotent `startTrace()`** - Provide custom `trace_id` for idempotency
- **HTTP Middleware Integration** - Pass trace ID through request pipeline
- **Service Layer Access** - Retrieve traces deep in your code

### 📚 Documentation
- **New Example**: `examples/hybrid-pattern.ts`
  - Context-based pattern
  - Manual access pattern
  - HTTP middleware integration
  - Long-running process with heartbeat
- **README Updates**: New sections on hybrid patterns

### 🔧 Implementation Details
- Added HTTP client methods for state retrieval
- Enhanced `ContextManager` with trace ID tracking
- Helper method `createTraceHandle()` for DRY code
- Auth headers support (API Key, Basic Auth)

### 💡 Use Cases
```typescript
// 1. HTTP Middleware Pattern
app.use(async (req, res, next) => {
  await sdk.startTrace({ trace_id: req.headers['x-trace-id'] });
  req.traceId = /* ... */;
  next();
});

app.get('/users/:id', async (req, res) => {
  const trace = await sdk.getTrace(req.traceId); // HTTP call
  // Use trace...
});

// 2. Context Pattern
const trace = sdk.getCurrentTrace(); // No HTTP call

// 3. Long-Running Jobs
await sdk.heartbeat('job-123'); // Prevent timeout
```

### ⚠️ Breaking Changes
None - fully backward compatible with v2.0.0

---

## 2.0.0 (2025-12-18) - Complete Rewrite

### 🚀 BREAKING CHANGES - Complete Architecture Rewrite

This is a **complete rewrite** of the TraceFlow SDK with a fundamentally different architecture. Not compatible with v1.x.

### ✨ New Architecture

#### Stateless Design
- **Removed**: Redis state management
- **Removed**: Internal state tracking
- **Removed**: Step number management
- SDK is now **completely stateless**
- All state management delegated to TraceFlow service

#### Transport Abstraction
- **New**: Transport interface for pluggable backends
- **New**: HTTP Transport (REST API)
- **New**: Kafka Transport (event streaming)
- Same API works with both transports
- Choose transport at runtime via configuration

#### Event-Based Model
- **Changed**: From status updates to append-only events
- **New Event Types**:
  - `trace_started`
  - `trace_finished`
  - `trace_failed`
  - `trace_cancelled`
  - `step_started`
  - `step_finished`
  - `step_failed`
  - `log_emitted`

#### Context Management
- **New**: AsyncLocalStorage for automatic context tracking
- **New**: `runWithTrace()` for automatic trace lifecycle
- Context propagates across async boundaries
- Support for nested traces
- Distributed tracing support

### 🎯 New Features

#### Core SDK
- `TraceFlowSDK` class with unified API
- `startTrace()` - Create new traces
- `runWithTrace()` - Automatic trace management
- `startStep()` - Create steps (context-aware)
- `log()` - Context-aware logging
- `flush()` - Manual flush
- `shutdown()` - Graceful shutdown

#### Handles
- `TraceHandle` - Manage trace lifecycle
- `StepHandle` - Manage step lifecycle
- Immutable, safe handles
- Auto-close prevention (idempotent)

#### Reliability
- **HTTP Transport**:
  - Exponential backoff with jitter
  - Circuit breaker pattern
  - Configurable retry logic
  - Request timeout handling
  - Batch queuing support
- **Kafka Transport**:
  - Idempotent producer
  - Partition by trace_id (ordering)
  - Fire-and-forget semantics
  - Auto-reconnect

#### Production Features
- **Silent errors** - Never fail application due to tracing
- **Auto-flush on exit** - SIGTERM, SIGINT, uncaught errors
- **Graceful shutdown** - Configurable flush timeout
- **Process exit handlers** - Automatic cleanup
- **No global state** - Multiple SDK instances supported
- **Tree-shakable** - Zero dependencies for HTTP-only usage

### 📦 Dependencies

#### Removed
- `redis` - No longer needed
- `@confluentinc/kafka-javascript` moved to `peerDependencies` (optional)

#### Added
- Zero new dependencies for HTTP transport
- Kafka client optional (peer dependency)

### 📚 API Changes

#### v1 → v2 Migration

| v1.x | v2.0 |
|------|------|
| `TraceFlowClient` | `TraceFlowSDK` |
| `trace()` | `startTrace()` |
| `step()` | `startStep()` |
| `TraceManager` | `TraceHandle` |
| `Step` | `StepHandle` |
| `redisUrl` config | Removed |
| `serviceUrl` config | Removed |
| `brokers` config | `kafka.brokers` |
| Direct Kafka required | HTTP or Kafka choice |

#### Removed APIs
- `TraceManager` class
- `Step` class
- `TraceFlowRedisClient`
- `TraceFlowServiceClient`
- `TraceCleaner`
- `initializeFromRedis()`
- `preventDuplicates` option
- `autoCloseSteps` option
- Direct Redis access

#### New APIs
- `TraceFlowSDK` class
- `runWithTrace()` - automatic management
- `TraceHandle` interface
- `StepHandle` interface
- `HTTPTransport` class
- `KafkaTransport` class
- `ContextManager` class
- Transport abstraction

### 🔧 Configuration Changes

```typescript
// v1.x
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
  serviceUrl: 'http://localhost:3009',
}, 'my-service');

// v2.0
const sdk = new TraceFlowSDK({
  transport: 'http', // or 'kafka'
  source: 'my-service',
  endpoint: 'http://localhost:3009', // for HTTP
  kafka: { // for Kafka
    brokers: ['localhost:9092'],
  },
});
```

### 🎨 New Patterns

#### HTTP Transport
```typescript
const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  maxRetries: 3,
  enableCircuitBreaker: true,
});
```

#### Kafka Transport
```typescript
const sdk = new TraceFlowSDK({
  transport: 'kafka',
  source: 'my-service',
  kafka: {
    brokers: ['localhost:9092'],
    topic: 'traceflow-events',
  },
});
```

#### Automatic Context
```typescript
await sdk.runWithTrace(
  { trace_type: 'api_request', title: 'Process' },
  async () => {
    const step = await sdk.startStep({ name: 'Validate' });
    await step.finish();
    return { success: true };
  }
);
```

### 📖 Documentation

- **New**: Complete README with examples
- **New**: HTTP transport example
- **New**: Kafka transport example
- **New**: Microservice integration example
- **New**: API reference
- **New**: Migration guide

### 🏗️ Technical Improvements

- Zero global state
- Async/await throughout
- TypeScript strict mode
- Tree-shakable exports
- Smaller bundle size
- Better error handling
- Production-ready patterns
- Kubernetes-optimized

### ⚠️ Migration Notes

This release is **NOT backward compatible**. To migrate:

1. Update import: `TraceFlowClient` → `TraceFlowSDK`
2. Choose transport: `'http'` or `'kafka'`
3. Update method calls: `trace()` → `startTrace()`
4. Remove Redis configuration
5. Update error handling (SDK never throws by default)
6. Review shutdown logic (now automatic)

See README for complete migration guide.

---

## Previous Versions (v1.x)

For v1.x changelog, see [CHANGELOG_V1.md](./CHANGELOG_V1.md)

### 1.2.2 (2025-11-13)

#### Bug Fixes
* preserve all data when closing steps and traces

### 1.2.1 (2025-11-13)

#### Bug Fixes
* Data preservation on close operations
* Auto-close steps data preservation

### 1.2.0 (2025-11-05)

#### Features
* Add traceflow: prefix to all Redis keys

### 1.1.1 (2025-11-05)

#### Improvements
* Redis Key Prefix

### 1.1.0 (2025-11-05)

#### Features
* State validation, duplicate prevention, and custom error classes

### 1.0.11 (2025-11-05)

#### Features
* State validation & error handling
* Duplicate prevention
* Custom error classes
* Enhanced logging

---

Built with ❤️ by Smartpricing
