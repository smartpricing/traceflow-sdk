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

### Basic Example

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

// Create a job
const job = await client.createJob({
  job_type: 'sync',
  title: 'Sync Airbnb Data',
  description: 'Synchronizing booking data',
  tags: ['airbnb', 'sync'],
  params: { start_date: '2024-01-01' },
});

// Update status to running
await job.updateJob({ status: TraceFlowJobStatus.RUNNING });

// Create step (with auto-increment!)
const step1 = await job.createStep({
  name: 'Fetch Data',
  step_type: 'fetch',
});

// Add log
await job.info('Fetching data from API...', undefined, step1);

// Complete the step
await job.completeStep(step1, { records_fetched: 100 });

// Create another step (will automatically be step_number: 1)
const step2 = await job.createStep({
  name: 'Transform Data',
  step_type: 'transform',
});

await job.completeStep(step2, { records_transformed: 100 });

// Complete the job
await job.completeJob({ total_records: 100, success: true });

// Disconnect
await client.disconnect();
```

## 📖 Usage

### 1. Creating the Client

#### With Kafka Configuration

```typescript
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

### 2. Creating a Job

```typescript
const job = await client.createJob({
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

console.log(`Job ID: ${job.getJobId()}`);
```

### 3. Updating a Job

```typescript
// Update status
await job.updateJob({ status: TraceFlowJobStatus.RUNNING });

// Update with multiple fields
await job.updateJob({
  status: TraceFlowJobStatus.RUNNING,
  metadata: { progress: '50%' },
});
```

### 4. Managing Steps

#### Auto-increment (Recommended)

Steps are automatically numbered starting from 0:

```typescript
// Step 0
const step1 = await job.createStep({
  name: 'Fetch Data',
  step_type: 'fetch',
  input: { endpoint: '/api/bookings' },
});

// Step 1 (auto-incremented!)
const step2 = await job.createStep({
  name: 'Transform Data',
  step_type: 'transform',
});

// Step 2 (auto-incremented!)
const step3 = await job.createStep({
  name: 'Save Data',
  step_type: 'save',
});
```

#### Manual Numbering

You can also manually specify step numbers:

```typescript
const step = await job.createStep({
  step_number: 10, // Explicit number
  name: 'Special Step',
  step_type: 'process',
});

// The next auto-incremented step will be 11
const nextStep = await job.createStep({
  name: 'Next Step',
}); // step_number: 11
```

#### Completing and Updating Steps

```typescript
// Complete successfully
await job.completeStep(step1, {
  records_processed: 150,
  duration_ms: 1234,
});

// Fail a step
await job.failStep(step2, 'Connection timeout');

// Update a step
await job.updateStep(step1, {
  status: TraceFlowStepStatus.IN_PROGRESS,
  metadata: { progress: '75%' },
});
```

### 5. Logging

#### Generic Logs

```typescript
await job.log({
  level: TraceFlowLogLevel.INFO,
  event_type: TraceFlowEventType.MESSAGE,
  message: 'Processing started',
  details: { batch_size: 100 },
  step_number: step1, // optional: link to a step
});
```

#### Logging Helpers

```typescript
// Job-level logs
await job.info('Job started successfully');
await job.warn('API response slow', { response_time: 3500 });
await job.error('Connection failed', { error_code: 'CONN_ERR' });
await job.debug('Debug info', { state: 'processing' });

// Step-linked logs
await job.info('Fetching data...', undefined, step1);
await job.warn('Partial data received', { expected: 100, received: 80 }, step1);
await job.error('Step failed', { reason: 'timeout' }, step1);
```

### 6. Completing or Failing a Job

```typescript
// Success
await job.completeJob({
  total_records: 150,
  sync_duration_ms: 5000,
  success: true,
});

// Failure
await job.failJob('Sync failed: connection timeout');

// Cancel
await job.cancelJob();
```

### 7. Retrieving an Existing Job

Useful for updating a job from another process or instance:

```typescript
const existingJob = client.getJobManager('existing-job-uuid');

// Now you can update the job
await existingJob.updateJob({ status: TraceFlowJobStatus.RUNNING });
await existingJob.completeJob({ success: true });
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

#### Constructor

```typescript
new TraceFlowClient(config: TraceFlowConfig, defaultSource?: string)
```

#### Methods

- `connect(): Promise<void>` - Connect to Kafka
- `disconnect(): Promise<void>` - Disconnect from Kafka
- `createJob(options: CreateJobOptions): Promise<JobManager>` - Create a new job
- `getJobManager(jobId: string, source?: string): JobManager` - Get manager for existing job
- `isConnected(): boolean` - Check if connected
- `getTopic(): string` - Get configured topic
- `getDefaultSource(): string | undefined` - Get default source

### JobManager

#### Job Methods

- `getJobId(): string` - Get job ID
- `updateJob(options: UpdateJobOptions): Promise<void>` - Update job
- `completeJob(result?: any): Promise<void>` - Complete job successfully
- `failJob(error: string): Promise<void>` - Fail job
- `cancelJob(): Promise<void>` - Cancel job

#### Step Methods

- `createStep(options?: CreateStepOptions): Promise<number>` - Create step (with auto-increment)
- `updateStep(stepNumber: number, options?: UpdateStepOptions): Promise<void>` - Update step
- `completeStep(stepNumber: number, output?: any): Promise<void>` - Complete step
- `failStep(stepNumber: number, error: string): Promise<void>` - Fail step

#### Log Methods

- `log(options: CreateLogOptions): Promise<void>` - Create generic log
- `info(message: string, details?: any, stepNumber?: number): Promise<void>` - INFO log
- `warn(message: string, details?: any, stepNumber?: number): Promise<void>` - WARN log
- `error(message: string, details?: any, stepNumber?: number): Promise<void>` - ERROR log
- `debug(message: string, details?: any, stepNumber?: number): Promise<void>` - DEBUG log

## 🎯 Best Practices

1. **Use auto-increment** for steps when possible - it's simpler and less error-prone
2. **Add detailed logging** - helps with debugging and monitoring
3. **Use metadata and tags** - facilitates filtering and job analysis
4. **Always handle errors** - use `failJob()` and `failStep()` appropriately
5. **Reuse Kafka connections** - pass existing instances for better performance
6. **Close connections** - always call `disconnect()` when done

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

