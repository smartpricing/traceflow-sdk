# TraceFlow SDK

TypeScript SDK for sending trace tracking messages to Kafka. Provides a simple interface to create, update, and complete traces with automatic step management and logging.

## 🌟 Features

- ✅ **Complete Trace Management** - Create, update, complete or fail traces
- ✅ **Auto-increment Steps** - Steps are automatically numbered if not specified
- ✅ **Integrated Logging** - Helpers for INFO, WARN, ERROR, DEBUG level logs
- ✅ **TypeScript First** - Fully typed with TypeScript
- ✅ **Flexible Kafka** - Use configuration or existing Kafka instance
- ✅ **Trace Manager** - Intuitive trace and step management via dedicated object
- ✅ **Rich Metadata** - Support for tags, custom metadata, params and results
- ✅ **Redis State Persistence** - Optional Redis integration for state recovery on pod restarts
- ✅ **Automatic Cleanup** - Built-in cleaner for inactive traces with configurable timeouts

## 📦 Installation

```bash
npm install traceflow-sdk
# or
yarn add traceflow-sdk
```

## 📚 Examples

Check out our [comprehensive examples](./examples/README.md) to learn how to use TraceFlow SDK in real-world scenarios:

- **[Singleton Pattern](./examples/singleton-pattern/README.md)** - **Recommended** for most applications. Initialize once, use everywhere without dependency injection.

## 🚀 Quick Start

### Singleton Pattern (Recommended)

The easiest way to use TraceFlow is with the singleton pattern - initialize once and use everywhere:

```typescript
import { TraceFlowClient } from 'traceflow-sdk';

// 1. Initialize once at application startup (e.g., in main.ts or app.ts)
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379', // For state persistence
  topic: 'traceflow', // Optional, defaults to 'traceflow'
});

await client.connect();

// 2. Then use anywhere in your application without passing the client around
async function someOperation() {
  // Get the singleton instance - no need to pass it as parameter!
  const client = TraceFlowClient.getInstance();
  
  const trace = client.trace({
    trace_type: 'user_registration',
    title: 'Register User',
  });
  
  const step = await trace.step({ name: 'Validate Input' });
  await step.complete({ output: { valid: true } });
  
  await trace.complete({ result: { success: true } });
}

// 3. Gracefully shutdown when app exits
process.on('SIGTERM', async () => {
  await client.disconnect();
  process.exit(0);
});
```

See the [complete singleton pattern example](./examples/singleton-pattern/README.md) for real-world usage with Express.js, NestJS, and Kubernetes.

### Standard Usage

You can also create instances directly:

```typescript
import { TraceFlowClient, TraceFlowTraceStatus } from 'traceflow-sdk';

// Create the client
const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    // topic: 'traceflow', // Optional (default: 'traceflow')
    clientId: 'my-app',
  },
  'my-service' // default source
);

// Connect to Kafka
await client.connect();

// Start a new trace
const trace = await client.trace({
  trace_type: 'sync',
  title: 'Sync Airbnb Data',
  description: 'Synchronizing booking data',
  tags: ['airbnb', 'sync'],
  params: { start_date: '2024-01-01' },
});

// Start the trace (set status to running)
await trace.start();

// Add a step - returns a Step instance
const step1 = await trace.step({
  name: 'Fetch Data',
  step_type: 'fetch',
});

// Use the Step instance directly
await step1.info('Fetching data from API...');
await step1.finish({ records_fetched: 100 });

// Add another step
const step2 = await trace.step({
  name: 'Transform Data',
  step_type: 'transform',
});

await step2.finish({ records_transformed: 100 });

// Finish the trace
await trace.finish({ total_records: 100, success: true });

// Disconnect
await client.disconnect();
```

### With Redis State Persistence

Enable Redis to persist trace/step state for recovery after pod restarts:

```typescript
import { TraceFlowClient } from 'traceflow-sdk';

const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    redisUrl: 'redis://localhost:6379', // Add Redis for state persistence
  },
  'my-service'
);

await client.connect();

const trace = await client.trace({
  trace_type: 'sync',
  title: 'Data Sync',
});

// State is automatically persisted to Redis
await trace.start();

const step = await trace.step({ name: 'Process' });
await step.finish();

await trace.finish();

// After pod restart, resume:
const resumedTrace = client.getTrace(traceId);
await resumedTrace.initializeFromRedis(); // Recover step numbers from Redis
// Continue where you left off...

await client.disconnect();
```

### With Auto-Close Steps

Enable automatic step closing when creating a new step:

```typescript
// Enable autoCloseSteps option
const trace = await client.trace(
  {
    trace_type: 'sync',
    title: 'Data Sync',
  },
  { autoCloseSteps: true } // Automatically close previous step
);

await trace.start();

const step1 = await trace.step({ name: 'Fetch' });
// Do work, but DON'T close step1

const step2 = await trace.step({ name: 'Process' });
// step1 is automatically closed when step2 is created!

await step2.finish();
await trace.finish();

// Disconnect
await client.disconnect();
```

## 📖 Usage

### 1. Initializing the Client

#### Singleton Pattern (Recommended)

Initialize once, use everywhere:

```typescript
import { initializeTraceFlow, getTraceFlow } from 'traceflow-sdk';

// At application startup (e.g., in your main.ts or app.ts)
const client = initializeTraceFlow(
  {
    brokers: ['localhost:9092'],
    // topic: 'traceflow', // Optional (default: 'traceflow')
    clientId: 'my-app',
  },
  'my-service'
);

await client.connect();

// Later, in any module or function
const client = getTraceFlow();
const trace = await client.trace({ ... });
```

#### Standard Instance

Or create a standard instance if you prefer:

```typescript
import { TraceFlowClient } from 'traceflow-sdk';

const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    // topic: 'traceflow', // Optional (default: 'traceflow')
    clientId: 'my-app',
  },
  'my-service' // optional: default source
);

await client.connect();
```

#### With Existing Kafka Instance

Useful when you already have a Kafka instance in your application:

```typescript
import { KafkaJS } from '@confluentinc/kafka-javascript';

const { Kafka } = KafkaJS;

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();
await producer.connect();

// Reuse the existing producer
const client = new TraceFlowClient(
  {
    kafka,
    producer,
    // topic: 'traceflow', // Optional (default: 'traceflow')
  },
  'my-service'
);

// No need to call connect() - the producer is already connected
```

Or pass the Kafka instance:

```typescript
const client = new TraceFlowClient(
  {
    kafka,
    producer,
    // topic: 'traceflow', // Optional (default: 'traceflow')
  },
  'my-service'
);

await client.connect();
```

#### With Redis State Persistence

Add Redis to enable state persistence and recovery:

```typescript
import { TraceFlowClient } from 'traceflow-sdk';

const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    clientId: 'my-app',
    redisUrl: 'redis://localhost:6379', // Enable Redis persistence
  },
  'my-service'
);

await client.connect();
```

Or use an existing Redis client:

```typescript
import { createClient } from 'redis';

const redisClient = createClient({ url: 'redis://localhost:6379' });
await redisClient.connect();

const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    redisClient, // Use existing Redis client
  },
  'my-service'
);

await client.connect();
```

#### With Automatic Cleanup (TraceCleaner)

Enable automatic cleanup of inactive traces:

```typescript
const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    redisUrl: 'redis://localhost:6379', // Required for cleaner
    cleanerConfig: {
      inactivityTimeoutSeconds: 1800,  // Close traces inactive > 30 min
      cleanupIntervalSeconds: 300,      // Check every 5 minutes
      autoStart: true,                  // Start automatically on connect
      logger: (msg, data) => console.log(msg, data), // Optional custom logger
    },
  },
  'my-service'
);

await client.connect(); // Cleaner starts automatically
```

### 2. Starting a Trace

```typescript
const trace = await client.trace({
  trace_type: 'sync', // trace type
  title: 'Sync Booking Data',
  description: 'Synchronizing bookings from Airbnb',
  owner: 'sync-service',
  tags: ['airbnb', 'booking', 'urgent'],
  metadata: {
    property_id: '12345',
    connection_id: 'conn-abc',
  },
  params: {
    start_date: '2024-01-01',
    end_date: '2024-01-31',
  },
});

console.log(`Trace ID: ${trace.getId()}`);
```

### 3. Managing Trace Status

```typescript
// Start the trace (utility method - sets status to RUNNING)
await trace.start();

// Or update status manually
await trace.update({ status: TraceFlowTraceStatus.RUNNING });

// Update with multiple fields
await trace.update({
  status: TraceFlowTraceStatus.RUNNING,
  metadata: { progress: '50%' },
});
```

### 4. Working with Steps

#### Step Class (Recommended)

The `step()` method returns a `Step` instance with its own methods:

```typescript
// Create a step - returns Step instance
const step = await trace.step({
  name: 'Fetch Data',
  step_type: 'fetch',
  input: { endpoint: '/api/bookings' },
});

// Use Step methods directly
await step.info('Fetching data...');
await step.update({ metadata: { progress: '50%' } });
await step.finish({ records_fetched: 100 });

// Or fail the step
// await step.fail('Connection timeout');
```

#### Auto-increment Step Numbers

Steps are automatically numbered starting from 0:

```typescript
// Step 0
const step1 = await trace.step({
  name: 'Fetch Data',
  step_type: 'fetch',
});

// Step 1 (auto-incremented!)
const step2 = await trace.step({
  name: 'Transform Data',
  step_type: 'transform',
});

// Step 2 (auto-incremented!)
const step3 = await trace.step({
  name: 'Save Data',
  step_type: 'save',
});
```

#### Auto-Close Steps Option

Enable automatic closing of previous steps:

```typescript
const trace = await client.trace(
  { trace_type: 'sync' },
  { autoCloseSteps: true } // Enable auto-close
);

const step1 = await trace.step({ name: 'Fetch' });
// Don't manually close step1

const step2 = await trace.step({ name: 'Process' });
// step1 is automatically closed (completed) when step2 is created!

await step2.finish();
```

#### Manual Step Numbering

You can also manually specify step numbers:

```typescript
const step = await trace.step({
  step_number: 10, // Explicit number
  name: 'Special Step',
  step_type: 'process',
});

// The next auto-incremented step will be 11
const nextStep = await trace.step({
  name: 'Next Step',
}); // step_number: 11
```

### 5. Logging

#### Step-Level Logging (Recommended)

Use the `Step` instance to add logs:

```typescript
const step = await trace.step({ name: 'Process Data' });

// Use Step logging methods
await step.info('Processing started');
await step.debug('Config loaded', { config: 'value' });
await step.warn('Slow response', { response_time: 3500 });
await step.error('Error occurred', { error_code: 'ERR_001' });

await step.finish({ processed: 100 });
```

#### Trace-Level Logging

You can also log at the trace level:

```typescript
await trace.info('Trace started successfully');
await trace.warn('API response slow', { response_time: 3500 });
await trace.error('Connection failed', { error_code: 'CONN_ERR' });
await trace.debug('Debug info', { state: 'processing' });
```

#### Generic Logs

For more control:

```typescript
await trace.log({
  level: TraceFlowLogLevel.INFO,
  event_type: TraceFlowEventType.MESSAGE,
  message: 'Processing started',
  details: { batch_size: 100 },
  step_number: step.getStepNumber(), // optional: link to a step
});
```

### 6. Finishing or Failing a Trace

```typescript
// Finish successfully (utility method)
await trace.finish({
  total_records: 150,
  sync_duration_ms: 5000,
  success: true,
});

// Or use complete (same as finish)
await trace.complete({ success: true });

// Failure
await trace.fail('Sync failed: connection timeout');

// Cancel
await trace.cancel();
```

### 7. Retrieving an Existing Trace

Useful for updating a trace from another process or instance:

```typescript
// Get an existing trace by ID
const existingTrace = client.getTrace('existing-trace-uuid');

// Update the trace
await existingTrace.start();

// Get a specific step
const step = existingTrace.getStep(0);
await step.update({ metadata: { progress: '75%' } });
await step.finish();

// Complete the trace
await existingTrace.finish({ success: true });
```

**Use Cases:**
- **Multi-service workflows:** Different services can work on the same trace
- **Long-running traces:** Resume a trace after process restart
- **Distributed systems:** Update traces from different nodes
- **Recovery:** Resume failed traces from their last state

## 📝 Complete Examples

For comprehensive examples covering all use cases, see the **[Examples Documentation](./examples/README.md)**.

Available examples:
- **[01-basic-usage.ts](./examples/01-basic-usage.ts)** - Getting started with TraceFlow
- **[02-auto-close-steps.ts](./examples/02-auto-close-steps.ts)** - Auto-closing steps feature
- **[03-singleton-pattern.ts](./examples/03-singleton-pattern.ts)** - Singleton pattern (recommended for production)
- **[04-step-logging.ts](./examples/04-step-logging.ts)** - Comprehensive logging at all levels
- **[05-error-handling.ts](./examples/05-error-handling.ts)** - Error handling and recovery
- **[06-existing-kafka-instance.ts](./examples/06-existing-kafka-instance.ts)** - Using existing Kafka connections
- **[07-complex-workflow.ts](./examples/07-complex-workflow.ts)** - Real-world ETL pipeline
- **[08-resuming-traces.ts](./examples/08-resuming-traces.ts)** - Resuming traces across services
- **[09-state-recovery.ts](./examples/09-state-recovery.ts)** - State recovery with TraceFlow Service

### Service Integration

**For state persistence and recovery after pod restarts**, see:
- **[Service Integration Guide](./SERVICE_INTEGRATION.md)** - Complete guide
- Integrate with your `traceflow-service` for persistent state
- Resume traces after pod crashes
- Query trace/step state from Scylla

### Automatic Trace Cleanup

**Integrated auto-cleanup for inactive traces**:

The SDK includes an integrated cleaner that can automatically close inactive traces. This is useful to prevent "zombie" traces from pod crashes or forgotten completions.

**Pattern:**
- **Main service** (tracing): cleaner **disabled**
- **Cron service** (cleanup): cleaner **enabled**

```typescript
// Main service - tracing only
const client = initializeTraceFlow({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000',
  // NO cleanerConfig - cleaner disabled
}, 'main-service');

// Cron service - cleanup only
const cronClient = initializeTraceFlow({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000', // Required
  cleanerConfig: {
    inactivityTimeoutSeconds: 1800,  // Close after 30 min
    cleanupIntervalSeconds: 300,     // Run every 5 min
    autoStart: true,                 // Start on connect
  },
}, 'cron-cleaner');
```

**See:**
- **[10-trace-cleaner.ts](./examples/10-trace-cleaner.ts)** - Complete examples
- **[Service Integration Guide](./SERVICE_INTEGRATION.md)** - API requirements

### Running Examples

```bash
# Run individual examples
npx ts-node examples/01-basic-usage.ts

# Run all examples
npx ts-node examples/index.ts
```

See **[Examples README](./examples/README.md)** for detailed documentation.

---

## 🎯 Quick Example: ETL Pipeline

```typescript
import { initializeTraceFlow } from '@dev.smartpricing/traceflow-sdk';

// Initialize once
const client = initializeTraceFlow({ brokers: ['localhost:9092'] });
await client.connect();

// Create trace with auto-close steps
const trace = await client.trace(
  { 
    trace_type: 'etl',
    title: 'Daily Data Pipeline',
  },
  { autoCloseSteps: true } // Automatic step management
);

await trace.start();

// Steps auto-close when creating the next one
const extract = await trace.step({ name: 'Extract' });
await extract.info('Extracting 1000 records...');

const transform = await trace.step({ name: 'Transform' });
// extract is auto-closed here!
await transform.info('Transforming data...');

const load = await trace.step({ name: 'Load' });
// transform is auto-closed here!
await load.info('Loading to warehouse...');

// Finish trace - all pending steps auto-closed
await trace.finish({ records: 1000 });

await client.disconnect();
```

---

## 🔧 Configuration

### Kafka Configuration

```typescript
const client = new TraceFlowClient({
  brokers: ['broker1:9092', 'broker2:9092'],
  // topic: 'traceflow', // Optional (default: 'traceflow')
  clientId: 'my-service',
  
  // Optional: SSL/TLS
  ssl: {
    rejectUnauthorized: false,
    ca: [fs.readFileSync('/path/to/ca-cert', 'utf-8')],
    key: fs.readFileSync('/path/to/client-key', 'utf-8'),
    cert: fs.readFileSync('/path/to/client-cert', 'utf-8'),
  },
  
  // Optional: SASL Authentication
  sasl: {
    mechanism: 'plain',
    username: 'my-username',
    password: 'my-password',
  },
});
```

---

## 🔧 API Reference

### TraceFlowClient

#### Singleton Methods (Recommended)

- `initializeTraceFlow(config: TraceFlowConfig, defaultSource?: string): TraceFlowClient` - Initialize singleton
- `getTraceFlow(): TraceFlowClient` - Get singleton instance
- `hasTraceFlow(): boolean` - Check if initialized
- `resetTraceFlow(): void` - Reset singleton (for testing)

#### Static Methods

- `TraceFlowClient.initialize(config, defaultSource?)` - Initialize singleton
- `TraceFlowClient.getInstance()` - Get singleton instance
- `TraceFlowClient.hasInstance()` - Check if initialized
- `TraceFlowClient.reset()` - Reset singleton

#### Constructor

```typescript
new TraceFlowClient(config: TraceFlowConfig, defaultSource?: string)
```

#### Instance Methods

- `connect(): Promise<void>` - Connect to Kafka
- `disconnect(): Promise<void>` - Disconnect from Kafka
- `trace(options: CreateTraceOptions, traceOptions?: TraceOptions): Promise<TraceManager>` - Start a new trace
- `getTrace(traceId: string, source?: string, traceOptions?: TraceOptions): TraceManager` - Get existing trace
- `isConnected(): boolean` - Check if connected
- `getTopic(): string` - Get configured topic
- `getDefaultSource(): string | undefined` - Get default source

### TraceManager

#### Trace Methods

- `getId(): string` - Get the trace ID
- `getStep(stepNumber: number): Step` - Get existing step by number
- `start(): Promise<void>` - Start trace (set status to RUNNING)
- `update(options: UpdateTraceOptions): Promise<void>` - Update trace
- `finish(result?: any): Promise<void>` - Finish trace successfully
- `complete(result?: any): Promise<void>` - Complete trace (same as finish)
- `fail(error: string): Promise<void>` - Fail trace
- `cancel(): Promise<void>` - Cancel trace

#### Step Methods

- `step(options?: CreateStepOptions): Promise<Step>` - Add a step (returns Step instance)
- `updateStep(stepNumber: number, options?: UpdateStepOptions): Promise<void>` - Update step (legacy)
- `finishStep(stepNumber: number, output?: any): Promise<void>` - Finish step (legacy)
- `completeStep(stepNumber: number, output?: any): Promise<void>` - Complete step (legacy)
- `failStep(stepNumber: number, error: string): Promise<void>` - Fail step (legacy)

### Step

The `Step` class represents a single step in a trace.

#### Methods

- `getStepNumber(): number` - Get step number
- `isClosed(): boolean` - Check if step is closed (completed/failed)
- `update(options: UpdateStepOptions): Promise<void>` - Update step
- `complete(output?: any): Promise<void>` - Complete step successfully
- `finish(output?: any): Promise<void>` - Finish step (alias for complete)
- `fail(error: string): Promise<void>` - Fail step
- `log(message: string, level: LogLevel, details?: any): Promise<void>` - Add log
- `info(message: string, details?: any): Promise<void>` - INFO log
- `warn(message: string, details?: any): Promise<void>` - WARN log
- `error(message: string, details?: any): Promise<void>` - ERROR log
- `debug(message: string, details?: any): Promise<void>` - DEBUG log

#### Log Methods

- `log(options: CreateLogOptions): Promise<void>` - Create generic log
- `info(message: string, details?: any, stepNumber?: number): Promise<void>` - INFO log
- `warn(message: string, details?: any, stepNumber?: number): Promise<void>` - WARN log
- `error(message: string, details?: any, stepNumber?: number): Promise<void>` - ERROR log
- `debug(message: string, details?: any, stepNumber?: number): Promise<void>` - DEBUG log

## 🎯 Best Practices

1. **Use the singleton pattern** - Initialize once with `initializeTraceFlow()`, use everywhere with `getTraceFlow()`
2. **Use auto-increment** for steps when possible - it's simpler and less error-prone
3. **Add detailed logging** - helps with debugging and monitoring
4. **Use metadata and tags** - facilitates filtering and trace analysis
5. **Always handle errors** - use `fail()` and `failStep()` appropriately
6. **Reuse Kafka connections** - the singleton pattern handles this automatically
7. **Close connections** - call `disconnect()` on application shutdown

## 📊 Kafka Message Schema

Messages sent to the Kafka topic have this format:

```json
{
  "type": "trace" | "step" | "log",
  "data": {
    // ... type-specific fields
  }
}
```

See the `cb-channel-scylla-writter` service documentation for complete schema details.

## 🤝 Integration

This SDK is designed to work with:

- **cb-channel-scylla-writter** - Kafka consumer that writes to ScyllaDB
- **scylla-trace-dashboard** - Nuxt dashboard for visualizing traces

## 🚀 Performance

This SDK uses [@confluentinc/kafka-javascript](https://github.com/confluentinc/confluent-kafka-javascript), Confluent's high-performance JavaScript client based on librdkafka. This provides:

- **Higher throughput** - Native C/C++ performance through librdkafka
- **Lower latency** - Optimized for production workloads
- **Reliability** - Battle-tested client used by Confluent
- **KafkaJS API compatibility** - Easy migration path from KafkaJS

## 📄 License

ISC

## 👨‍💻 Author

Andrei Borcea

