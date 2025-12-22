# TraceFlow SDK v2

🚀 **Production-ready, stateless SDK for distributed tracing**

Trace your distributed systems with confidence using HTTP or Kafka transport.

## ✨ Features

- **📦 Stateless** - No Redis, no databases, pure event streaming
- **🔀 Transport Agnostic** - Use HTTP REST API or Kafka, same API
- **🧵 Context-Aware** - Automatic context propagation using AsyncLocalStorage
- **🔄 Retry Logic** - Built-in exponential backoff and circuit breaker
- **🛡️ Production-Ready** - Never fails your app, always safe
- **🎯 Type-Safe** - Full TypeScript support
- **📊 Ordering Guarantees** - Kafka partitioning by trace_id
- **🌊 Async-First** - Works seamlessly across async boundaries
- **☸️ Kubernetes-Ready** - Graceful shutdown and auto-cleanup
- **📝 Event-Based** - Append-only event model

## 🏗️ Architecture

```
┌─────────────────┐
│   Your App      │
│  ┌───────────┐  │
│  │ TraceFlow │  │
│  │    SDK    │  │
│  └─────┬─────┘  │
└────────┼────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼──────┐
│  HTTP │ │  Kafka  │
│   API │ │  Topic  │
└───┬───┘ └──┬──────┘
    │        │
┌───▼────────▼───┐
│  TraceFlow     │
│   Service      │
│                │
│ ┌────────────┐ │
│ │  ScyllaDB  │ │
│ └────────────┘ │
│ ┌────────────┐ │
│ │   Redis    │ │
│ └────────────┘ │
└────────────────┘
```

## 📦 Installation

```bash
npm install @dev.smartpricing/traceflow-sdk
```

### Optional: For Kafka transport

```bash
npm install @confluentinc/kafka-javascript
```

## 🚀 Quick Start

### HTTP Transport

```typescript
import { TraceFlowSDK } from '@dev.smartpricing/traceflow-sdk';

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  apiKey: 'your-api-key', // Optional
});

// Start a trace
const trace = await sdk.startTrace({
  trace_type: 'api_request',
  title: 'Process User Request',
});

// Start a step
const step = await trace.startStep({
  name: 'Validate Input',
  input: { userId: 123 },
});

// Log
await step.log('Validation successful');

// Finish step
await step.finish({ output: { valid: true } });

// Finish trace
await trace.finish({ result: { success: true } });

// Cleanup
await sdk.shutdown();
```

### Kafka Transport

```typescript
import { TraceFlowSDK } from '@dev.smartpricing/traceflow-sdk';

const sdk = new TraceFlowSDK({
  transport: 'kafka',
  source: 'my-service',
  kafka: {
    brokers: ['localhost:9092'],
    clientId: 'my-service',
    topic: 'traceflow-events',
  },
});

// Same API as HTTP!
const trace = await sdk.startTrace({
  trace_type: 'background_job',
  title: 'Process Data',
});

await trace.finish();
```

## 🎯 Key Concepts

### 1. **Automatic Context Management**

Use `runWithTrace` to automatically manage trace lifecycle:

```typescript
await sdk.runWithTrace(
  {
    trace_type: 'data_sync',
    title: 'Sync Users',
  },
  async () => {
    // Trace context is automatically available
    const step = await sdk.startStep({ name: 'Fetch Data' });
    
    // Do work...
    await step.finish();
    
    // Trace auto-completes on return
    return { synced: 100 };
  }
);
```

### 2. **Nested Operations**

Steps and traces work across async boundaries:

```typescript
async function processOrder(orderId: string) {
  const step = await sdk.startStep({
    name: 'Process Order',
    input: { orderId },
  });

  try {
    await validateOrder(orderId); // Can start substeps
    await chargePayment(orderId); // Can start substeps
    await shipOrder(orderId);     // Can start substeps
    
    await step.finish({ output: { status: 'shipped' } });
  } catch (error) {
    await step.fail(error);
    throw error;
  }
}
```

### 3. **Cross-Service Tracing**

Share trace context across services:

```typescript
// Service A: Start trace
const trace = await sdk.startTrace({
  trace_type: 'user_registration',
});

// Call Service B with trace ID
await fetch('https://service-b/api/endpoint', {
  headers: {
    'X-Trace-Id': trace.trace_id,
  },
});

// Service B: Retrieve same trace
const traceId = req.headers['x-trace-id'];

const trace = await sdk.getTrace(traceId);
await trace.startStep({ name: 'Send Email' });
```

### 4. **Hybrid Pattern: Context + Manual Access**

Mix automatic context with manual trace access:

```typescript
// Middleware: Start trace with custom ID
app.use(async (req, res, next) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  
  await sdk.startTrace({ 
    trace_id: traceId,
    title: `${req.method} ${req.path}` 
  });
  
  req.traceId = traceId;
  next();
});

// Controller: Retrieve trace by ID
app.get('/users/:id', async (req, res) => {
  const trace = await sdk.getTrace(req.traceId);
  
  const step = await trace.startStep({ name: 'Fetch User' });
  const user = await getUserFromDB(req.params.id);
  await step.finish({ output: user });
  
  await trace.finish({ result: user });
  res.json(user);
});

// Service Layer: Deep in your code
class UserService {
  async getUser(userId: string, traceId: string) {
    // Retrieve same trace
    const trace = await sdk.getTrace(traceId);
    await trace.log('Querying database...');
    // ...
  }
}

// Or use context (if inside runWithTrace)
async function anyFunction() {
  const trace = sdk.getCurrentTrace();
  if (trace) {
    await trace.log('Has access from context!');
  }
}
```

### 5. **Long-Running Processes**

Prevent timeout with heartbeats:

```typescript
const trace = await sdk.startTrace({
  trace_id: 'batch-job-123',
  title: 'Long Batch Job',
});

// Send heartbeat every minute
const heartbeatInterval = setInterval(() => {
  sdk.heartbeat('batch-job-123');
}, 60000);

// Do long work...
for (let i = 0; i < 100; i++) {
  await processBatch(i);
}

clearInterval(heartbeatInterval);
await trace.finish();
```

### 6. **Error Handling**

SDK never throws due to tracing failures:

```typescript
const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  silentErrors: true, // Default: true - never throws
});

// Even if tracing fails, your app continues
const trace = await sdk.startTrace({ title: 'My Trace' });
// ✅ Always returns a valid handle, never throws
```

## 🔧 Configuration

### Full Configuration Options

```typescript
interface TraceFlowSDKConfig {
  // Transport
  transport: 'http' | 'kafka';
  source: string;
  
  // HTTP options
  endpoint?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number; // Default: 5000ms
  
  // Kafka options
  kafka?: {
    brokers: string[];
    clientId?: string;
    topic?: string; // Default: 'traceflow-events'
    sasl?: {
      mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
      username: string;
      password: string;
    };
    ssl?: boolean | object;
  };
  
  // Retry & reliability
  maxRetries?: number; // Default: 3
  retryDelay?: number; // Default: 1000ms
  enableCircuitBreaker?: boolean; // Default: true
  
  // Behavior
  autoFlushOnExit?: boolean; // Default: true
  flushTimeoutMs?: number; // Default: 5000ms
  silentErrors?: boolean; // Default: true
}
```

## 📚 API Reference

### SDK Methods

#### `startTrace(options): Promise<TraceHandle>`

Start a new trace. If `trace_id` is provided, it's idempotent.

```typescript
const trace = await sdk.startTrace({
  trace_id?: string;        // Optional: Custom trace ID (idempotent if provided)
  trace_type?: string;      // Type of trace
  title?: string;           // Human-readable title
  description?: string;     // Description
  owner?: string;           // Owner/service
  tags?: string[];          // Tags for filtering
  metadata?: object;        // Custom metadata
  params?: any;             // Input parameters
  idempotency_key?: string; // For idempotency
  trace_timeout_ms?: number; // Custom timeout for this trace (milliseconds)
  step_timeout_ms?: number;  // Custom timeout for steps in this trace (milliseconds)
});
```

**Custom Timeouts:**
- If not specified, the service uses its default timeout settings
- `trace_timeout_ms`: Maximum time for the entire trace to complete
- `step_timeout_ms`: Maximum time for each step to complete
- Use for processes with known execution time characteristics
- Examples: Quick APIs (5s), Batch jobs (10m), ML training (2h)

#### `getTrace(traceId): Promise<TraceHandle>`

Get an existing trace by ID. Makes HTTP call to fetch state from service.

**Note:** Only works with HTTP transport.

```typescript
// Retrieve existing trace
const trace = await sdk.getTrace('existing-trace-id');

// Can now use it to add steps, logs, etc.
await trace.startStep({ name: 'Continue Process' });
await trace.finish();
```

#### `getCurrentTrace(): TraceHandle | null`

Get current trace from context (no HTTP call).

```typescript
// Inside runWithTrace or after startTrace
const trace = sdk.getCurrentTrace();

if (trace) {
  await trace.log('Processing...');
}
```

#### `heartbeat(traceId?): Promise<void>`

Send heartbeat to update `last_activity_at` (prevents timeout).

**Note:** Only works with HTTP transport.

```typescript
// Explicit trace ID
await sdk.heartbeat('trace-123');

// Or use current context
await sdk.heartbeat();
```

#### `runWithTrace(options, fn): Promise<T>`

Run function with automatic trace management.

```typescript
const result = await sdk.runWithTrace(
  { trace_type: 'my_process', title: 'My Process' },
  async () => {
    // Your code here
    return { success: true };
  }
);
```

#### `startStep(options): Promise<StepHandle>`

Start a step (requires active trace context).

```typescript
const step = await sdk.startStep({
  step_id?: string;     // Optional: Custom step ID
  name?: string;        // Step name
  step_type?: string;   // Type of step
  input?: any;          // Input data
  metadata?: object;    // Custom metadata
});
```

#### `log(message, options): Promise<void>`

Log a message (uses current context).

```typescript
await sdk.log('Processing user data', {
  level: LogLevel.INFO, // DEBUG, INFO, WARN, ERROR, FATAL
  event_type?: string;
  details?: any;
});
```

#### `flush(): Promise<void>`

Flush all pending events.

```typescript
await sdk.flush();
```

#### `shutdown(): Promise<void>`

Gracefully shutdown SDK.

```typescript
await sdk.shutdown();
```

### TraceHandle Methods

```typescript
await trace.finish({ result?: any, metadata?: object });
await trace.fail(error: string | Error);
await trace.cancel();
await trace.startStep(options);
await trace.log(message, options);
```

### StepHandle Methods

```typescript
await step.finish({ output?: any, metadata?: object });
await step.fail(error: string | Error);
await step.log(message, options);
```

## 🌐 Microservice Integration

See `examples/microservice-example.ts` for a complete example with Express.

### Middleware Pattern

```typescript
// Initialize once
const traceflow = new TraceFlowSDK({
  transport: 'http',
  source: process.env.SERVICE_NAME,
  endpoint: process.env.TRACEFLOW_ENDPOINT,
});

// Middleware
app.use(async (req, res, next) => {
  // Use trace ID from header if present, otherwise create new
  const traceId = req.headers['x-trace-id'];
  
  const trace = traceId
    ? await traceflow.getTrace(traceId)
    : await traceflow.startTrace({
        trace_type: 'http_request',
        title: `${req.method} ${req.path}`,
      });

  req.trace = trace;
  res.setHeader('x-trace-id', trace.trace_id);
  
  next();
});

// Routes
app.get('/users/:id', async (req, res) => {
  try {
    const step = await sdk.startStep({ name: 'Get User' });
    const user = await getUserFromDB(req.params.id);
    await step.finish({ output: user });
    
    await req.trace.finish({ result: user });
    res.json(user);
  } catch (error) {
    await req.trace.fail(error);
    res.status(500).json({ error: error.message });
  }
});
```

## 🐳 Kubernetes Deployment

The SDK handles graceful shutdown automatically:

```typescript
const sdk = new TraceFlowSDK({
  transport: 'kafka',
  source: process.env.SERVICE_NAME,
  kafka: { brokers: process.env.KAFKA_BROKERS.split(',') },
  autoFlushOnExit: true, // Auto-flush on SIGTERM
  flushTimeoutMs: 5000,  // Wait up to 5s for flush
});

// SDK automatically handles:
// - SIGTERM (Kubernetes shutdown)
// - SIGINT (Ctrl+C)
// - Uncaught exceptions
// - Unhandled rejections
```

## 🔒 Production Best Practices

### 1. **Always Use Silent Errors in Production**

```typescript
const sdk = new TraceFlowSDK({
  // ... config
  silentErrors: true, // Never fail your app due to tracing
});
```

### 2. **Enable Circuit Breaker**

```typescript
const sdk = new TraceFlowSDK({
  // ... config
  enableCircuitBreaker: true, // Auto-disable on repeated failures
  maxRetries: 3,
  retryDelay: 1000,
});
```

### 3. **Use Environment Variables**

```typescript
const sdk = new TraceFlowSDK({
  transport: process.env.TRACE_TRANSPORT as 'http' | 'kafka',
  source: process.env.SERVICE_NAME!,
  endpoint: process.env.TRACEFLOW_ENDPOINT,
  kafka: process.env.KAFKA_BROKERS ? {
    brokers: process.env.KAFKA_BROKERS.split(','),
  } : undefined,
});
```

### 4. **Singleton Pattern**

```typescript
// tracing.ts
export const traceflow = new TraceFlowSDK({ /* config */ });

// everywhere else
import { traceflow } from './tracing';
```

## 📊 Event Model

The SDK emits events, not state updates:

```typescript
{
  event_id: string;
  event_type: 
    | 'trace_started'
    | 'trace_finished'
    | 'trace_failed'
    | 'trace_cancelled'
    | 'step_started'
    | 'step_finished'
    | 'step_failed'
    | 'log_emitted';
  trace_id: string;
  step_id?: string;
  timestamp: string;
  source: string;
  payload: Record<string, any>;
}
```

## 🆚 Migration from v1

### Breaking Changes

| v1 | v2 |
|----|-----|
| `TraceFlowClient` | `TraceFlowSDK` |
| `trace()` | `startTrace()` |
| `step()` | `startStep()` |
| `TraceManager` | `TraceHandle` |
| `Step` class | `StepHandle` |
| Direct Kafka | Transport abstraction |
| Redis state | Stateless |
| Status messages | Event messages |

### Migration Example

```typescript
// v1
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
}, 'my-service');

await client.connect();
const trace = await client.trace({ title: 'My Trace' });
const step = await trace.step({ name: 'My Step' });
await step.finish();
await trace.finish();

// v2
const sdk = new TraceFlowSDK({
  transport: 'kafka',
  source: 'my-service',
  kafka: { brokers: ['localhost:9092'] },
});

const trace = await sdk.startTrace({ title: 'My Trace' });
const step = await trace.startStep({ name: 'My Step' });
await step.finish();
await trace.finish();
await sdk.shutdown();
```

## 📖 Examples

- [`examples/http-transport.ts`](./examples/http-transport.ts) - HTTP transport usage
- [`examples/kafka-transport.ts`](./examples/kafka-transport.ts) - Kafka transport usage
- [`examples/microservice-example.ts`](./examples/microservice-example.ts) - Full microservice integration
- [`examples/hybrid-pattern.ts`](./examples/hybrid-pattern.ts) - Hybrid context + manual access patterns
- [`examples/custom-timeouts.ts`](./examples/custom-timeouts.ts) - **NEW:** Custom trace and step timeouts

## 🤝 Contributing

Contributions are welcome! Please open an issue or PR.

## 📄 License

ISC © Smartpricing

## 🔗 Links

- [TraceFlow Service](https://github.com/smartpricing/traceflow-service)
- [Documentation](https://docs.traceflow.io)
- [API Reference](http://localhost:3009/docs)

---

Built with ❤️ by Smartpricing

