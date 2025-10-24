# TraceFlow SDK

TypeScript SDK for sending job tracking messages to Kafka. Provides a simple interface to create, update, and complete jobs with automatic step management and logging.

## 🌟 Features

- ✅ **Complete Job Management** - Create, update, complete or fail jobs
- ✅ **Auto-increment Steps** - Steps are automatically numbered if not specified
- ✅ **Integrated Logging** - Helpers for INFO, WARN, ERROR, DEBUG level logs
- ✅ **TypeScript First** - Fully typed with TypeScript
- ✅ **Flexible Kafka** - Use configuration or existing Kafka instance
- ✅ **Job Manager** - Intuitive job and step management via dedicated object
- ✅ **Rich Metadata** - Support for tags, custom metadata, params and results

## 📦 Installation

```bash
npm install traceflow-sdk
# or
yarn add traceflow-sdk
```

## 🚀 Quick Start

### Singleton Pattern (Recommended)

The easiest way to use TraceFlow is with the singleton pattern:

```typescript
import { initializeTraceFlow, getTraceFlow } from 'traceflow-sdk';

// Initialize once at application startup
const client = initializeTraceFlow(
  {
    brokers: ['localhost:9092'],
    topic: 'ota-jobs',
    clientId: 'my-app',
  },
  'my-service' // default source
);

await client.connect();

// Now trace from anywhere in your application
async function someOperation() {
  const client = getTraceFlow();
  
  const trace = await client.trace({
    job_type: 'sync',
    title: 'Data Sync',
  });
  
  await trace.start();
  // ... your logic
  await trace.finish();
}
```

### Standard Usage

You can also create instances directly:

```typescript
import { TraceFlowClient, TraceFlowJobStatus } from 'traceflow-sdk';

// Create the client
const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    topic: 'ota-jobs',
    clientId: 'my-app',
  },
  'my-service' // default source
);

// Connect to Kafka
await client.connect();

// Start a new trace
const trace = await client.trace({
  job_type: 'sync',
  title: 'Sync Airbnb Data',
  description: 'Synchronizing booking data',
  tags: ['airbnb', 'sync'],
  params: { start_date: '2024-01-01' },
});

// Start the trace (set status to running)
await trace.start();

// Add a step (with auto-increment!)
const step1 = await trace.step({
  name: 'Fetch Data',
  step_type: 'fetch',
});

// Add log
await trace.info('Fetching data from API...', undefined, step1);

// Finish the step
await trace.finishStep(step1, { records_fetched: 100 });

// Add another step (will automatically be step_number: 1)
const step2 = await trace.step({
  name: 'Transform Data',
  step_type: 'transform',
});

await trace.finishStep(step2, { records_transformed: 100 });

// Finish the trace
await trace.finish({ total_records: 100, success: true });

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
    topic: 'ota-jobs',
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
    topic: 'ota-jobs',
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
    topic: 'ota-jobs',
    producer: producer, // Use existing producer
  },
  'my-service'
);

// No need to call connect() - the producer is already connected
```

Or pass the Kafka instance:

```typescript
const client = new TraceFlowClient(
  {
    topic: 'ota-jobs',
    kafka: kafka, // Pass the Kafka instance
  },
  'my-service'
);

await client.connect();
```

### 2. Starting a Trace

```typescript
const trace = await client.trace({
  job_type: 'sync', // job type
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

console.log(`Trace ID: ${trace.getJobId()}`);
```

### 3. Managing Trace Status

```typescript
// Start the trace (utility method - sets status to RUNNING)
await trace.start();

// Or update status manually
await trace.updateJob({ status: TraceFlowJobStatus.RUNNING });

// Update with multiple fields
await trace.updateJob({
  status: TraceFlowJobStatus.RUNNING,
  metadata: { progress: '50%' },
});
```

### 4. Adding Steps

#### Auto-increment (Recommended)

Steps are automatically numbered starting from 0:

```typescript
// Step 0
const step1 = await trace.step({
  name: 'Fetch Data',
  step_type: 'fetch',
  input: { endpoint: '/api/bookings' },
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

#### Manual Numbering

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

#### Finishing and Managing Steps

```typescript
// Finish successfully (utility method)
await trace.finishStep(step1, {
  records_processed: 150,
  duration_ms: 1234,
});

// Or use completeStep (same as finishStep)
await trace.completeStep(step1, { result: 'success' });

// Fail a step
await trace.failStep(step2, 'Connection timeout');

// Update a step
await trace.updateStep(step1, {
  status: TraceFlowStepStatus.IN_PROGRESS,
  metadata: { progress: '75%' },
});
```

### 5. Logging

#### Generic Logs

```typescript
await trace.log({
  level: TraceFlowLogLevel.INFO,
  event_type: TraceFlowEventType.MESSAGE,
  message: 'Processing started',
  details: { batch_size: 100 },
  step_number: step1, // optional: link to a step
});
```

#### Logging Helpers

```typescript
// Trace-level logs
await trace.info('Trace started successfully');
await trace.warn('API response slow', { response_time: 3500 });
await trace.error('Connection failed', { error_code: 'CONN_ERR' });
await trace.debug('Debug info', { state: 'processing' });

// Step-linked logs
await trace.info('Fetching data...', undefined, step1);
await trace.warn('Partial data received', { expected: 100, received: 80 }, step1);
await trace.error('Step failed', { reason: 'timeout' }, step1);
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
const existingTrace = client.getJobManager('existing-trace-uuid');

// Now you can update the trace
await existingTrace.start();
await existingTrace.complete({ success: true });
```

## 📝 Complete Examples

### Example 1: Sync with Retry Logic

```typescript
const job = await client.createJob({
  job_type: 'sync',
  title: 'Sync with Retry',
  metadata: { max_retries: '3' },
});

await job.updateJob({ status: TraceFlowJobStatus.RUNNING });

const step = await job.createStep({
  name: 'Fetch API',
  step_type: 'fetch',
});

let attempt = 0;
const maxRetries = 3;

for (attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    await job.info(`Attempt ${attempt} of ${maxRetries}`, { attempt }, step);

    // Your code here...
    const data = await fetchExternalAPI();

    await job.completeStep(step, { success: true, attempts: attempt });
    break;
  } catch (error: any) {
    await job.warn(`Attempt ${attempt} failed`, { attempt, error: error.message }, step);

    if (attempt === maxRetries) {
      await job.failStep(step, 'Max retries exceeded');
      await job.failJob('Sync failed after all retries');
      return;
    }

    const delay = Math.pow(2, attempt) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

await job.completeJob({ success: true });
```

### Example 2: Complex Workflow

```typescript
const job = await client.createJob({
  job_type: 'import',
  title: 'Complex Data Import',
});

await job.updateJob({ status: TraceFlowJobStatus.RUNNING });

// Phase 1: Download
const downloadStep = await job.createStep({
  name: 'Download CSV',
  step_type: 'download',
});

await job.info('Starting download...', undefined, downloadStep);
const fileData = await downloadFile();
await job.completeStep(downloadStep, { file_size: fileData.size });

// Phase 2: Validation
const validateStep = await job.createStep({
  name: 'Validate Data',
  step_type: 'validation',
});

const validation = await validateData(fileData);
if (!validation.valid) {
  await job.error('Validation failed', validation.errors, validateStep);
  await job.failStep(validateStep, 'Invalid data format');
  await job.failJob('Import aborted due to validation errors');
  return;
}

await job.completeStep(validateStep, { records_validated: validation.count });

// Phase 3: Import
const importStep = await job.createStep({
  name: 'Import to Database',
  step_type: 'import',
});

let imported = 0;
for (const batch of validation.batches) {
  await importBatch(batch);
  imported += batch.length;
  await job.info(`Imported ${imported} records`, { imported, total: validation.count }, importStep);
}

await job.completeStep(importStep, { imported });

// Complete
await job.completeJob({
  total_imported: imported,
  file_size: fileData.size,
  duration_ms: Date.now() - startTime,
});
```

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
- `trace(options: CreateJobOptions): Promise<JobManager>` - Start a new trace
- `traceJob(options: CreateJobOptions): Promise<JobManager>` - Alias for trace() (deprecated)
- `createJob(options: CreateJobOptions): Promise<JobManager>` - Alias for trace() (deprecated)
- `getJobManager(jobId: string, source?: string): JobManager` - Get manager for existing trace
- `isConnected(): boolean` - Check if connected
- `getTopic(): string` - Get configured topic
- `getDefaultSource(): string | undefined` - Get default source

### JobManager

#### Trace Methods

- `getJobId(): string` - Get trace ID
- `start(): Promise<void>` - Start trace (set status to RUNNING)
- `updateJob(options: UpdateJobOptions): Promise<void>` - Update trace
- `finish(result?: any): Promise<void>` - Finish trace successfully
- `complete(result?: any): Promise<void>` - Complete trace (same as finish)
- `fail(error: string): Promise<void>` - Fail trace
- `cancel(): Promise<void>` - Cancel trace
- `startJob(): Promise<void>` - Alias for start() (deprecated)
- `finishJob(result?: any): Promise<void>` - Alias for finish() (deprecated)
- `completeJob(result?: any): Promise<void>` - Alias for complete() (deprecated)
- `failJob(error: string): Promise<void>` - Alias for fail() (deprecated)
- `cancelJob(): Promise<void>` - Alias for cancel() (deprecated)

#### Step Methods

- `step(options?: CreateStepOptions): Promise<number>` - Add a step (with auto-increment)
- `updateStep(stepNumber: number, options?: UpdateStepOptions): Promise<void>` - Update step
- `finishStep(stepNumber: number, output?: any): Promise<void>` - Finish step successfully
- `completeStep(stepNumber: number, output?: any): Promise<void>` - Complete step (same as finishStep)
- `failStep(stepNumber: number, error: string): Promise<void>` - Fail step
- `traceStep(options?: CreateStepOptions): Promise<number>` - Alias for step() (deprecated)
- `createStep(options?: CreateStepOptions): Promise<number>` - Alias for step() (deprecated)

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
4. **Use metadata and tags** - facilitates filtering and job analysis
5. **Always handle errors** - use `fail()` and `failStep()` appropriately
6. **Reuse Kafka connections** - the singleton pattern handles this automatically
7. **Close connections** - call `disconnect()` on application shutdown

## 📊 Kafka Message Schema

Messages sent to the Kafka topic have this format:

```json
{
  "type": "job" | "step" | "log",
  "data": {
    // ... type-specific fields
  }
}
```

See the `cb-channel-scylla-writter` service documentation for complete schema details.

## 🤝 Integration

This SDK is designed to work with:

- **cb-channel-scylla-writter** - Kafka consumer that writes to ScyllaDB
- **scylla-job-dashboard** - Nuxt dashboard for visualizing jobs

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

