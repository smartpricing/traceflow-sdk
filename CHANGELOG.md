# Changelog

All notable changes to this project will be documented in this file.

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

