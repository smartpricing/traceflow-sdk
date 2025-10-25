# TraceFlow SDK - Examples

This directory contains comprehensive examples demonstrating all features and use cases of the TraceFlow SDK.

## 📚 Examples Overview

### 01. Basic Usage
**File:** [`01-basic-usage.ts`](./01-basic-usage.ts)

**What you'll learn:**
- Creating and initializing a TraceFlow client
- Starting and finishing traces
- Creating steps manually
- Manual step lifecycle management
- Proper connection and disconnection

**Key Concepts:**
```typescript
// Default topic is 'traceflow'
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  // topic: 'custom-topic', // Optional
});

const trace = await client.trace({ ... });
await trace.start();
const step = await trace.step({ ... });
await step.finish();
await trace.finish();
```

---

### 02. Auto-Close Steps
**File:** [`02-auto-close-steps.ts`](./02-auto-close-steps.ts)

**What you'll learn:**
- Using the `autoCloseSteps` option
- Automatic step closing when creating new steps
- Automatic step closing when trace finishes/fails/cancels
- Forgetting to close steps without worrying

**Key Concepts:**
```typescript
const trace = await client.trace(
  { ... },
  { autoCloseSteps: true } // ← Enable auto-close
);

const step1 = await trace.step({ name: 'Step 1' });
// No need to call step1.finish()

const step2 = await trace.step({ name: 'Step 2' });
// step1 is auto-closed here!

await trace.finish(); // All pending steps auto-closed
```

**When to use:** Sequential workflows where you want to simplify step management.

---

### 03. Singleton Pattern
**File:** [`03-singleton-pattern.ts`](./03-singleton-pattern.ts)

**What you'll learn:**
- Initializing the client once with `initializeTraceFlow()`
- Getting the instance from anywhere with `getTraceFlow()`
- Managing a single Kafka connection across your app
- Multiple traces from the same client instance

**Key Concepts:**
```typescript
// In main.ts or app.ts
const client = initializeTraceFlow({ ... });
await client.connect();

// In any other file
const client = getTraceFlow();
const trace = await client.trace({ ... });
```

**When to use:** Production applications where you want a single Kafka connection managed globally.

---

### 04. Step Logging
**File:** [`04-step-logging.ts`](./04-step-logging.ts)

**What you'll learn:**
- Different log levels: INFO, WARN, ERROR, DEBUG
- Logging at step level vs trace level
- Adding structured details to logs
- Best practices for observability

**Key Concepts:**
```typescript
const step = await trace.step({ ... });

await step.info('Processing data...');
await step.debug('Debug info', { config: '...' });
await step.warn('Slow response', { latency: 3000 });
await step.error('Failed', { error: '...' });

// Trace-level logging
await trace.info('Trace started');
```

**When to use:** When you need comprehensive logging for debugging and monitoring.

---

### 05. Error Handling
**File:** [`05-error-handling.ts`](./05-error-handling.ts)

**What you'll learn:**
- Failing individual steps without stopping the trace
- Failing the entire trace
- Try-catch patterns with step error handling
- Auto-closing steps on trace failure
- Recovery and cleanup steps

**Key Concepts:**
```typescript
// Fail a step
await step.error('Something went wrong', { ... });
await step.fail('Error message');

// Fail entire trace (auto-closes all pending steps)
await trace.fail('Critical error');

// Try-catch pattern
try {
  // ... work
  await step.finish();
} catch (error) {
  await step.error('Failed', { error: error.message });
  await step.fail(error.message);
  await trace.fail(`Trace failed: ${error.message}`);
}
```

**When to use:** Real-world scenarios where errors can occur at any step.

---

### 06. Using Existing Kafka Instance
**File:** [`06-existing-kafka-instance.ts`](./06-existing-kafka-instance.ts)

**What you'll learn:**
- Passing an existing Kafka client to TraceFlowClient
- Sharing a Kafka connection across multiple services
- Managing connection lifecycle externally
- Using the same producer for traces and other Kafka messages

**Key Concepts:**
```typescript
const kafka = new Kafka({ ... });
const producer = kafka.producer();
await producer.connect();

const traceClient = new TraceFlowClient({
  kafka,
  producer,
  topic: 'traces',
});

// Don't call traceClient.connect()
// Connection is managed externally
```

**When to use:** When you already have a Kafka setup and want to integrate TraceFlow without additional connections.

---

### 07. Complex Workflow
**File:** [`07-complex-workflow.ts`](./07-complex-workflow.ts)

**What you'll learn:**
- Real-world ETL pipeline scenario
- Multi-step workflow with conditional logic
- Rich metadata and detailed logging
- Progress tracking across multiple steps
- Generating comprehensive reports

**Key Concepts:**
- Extract, Transform, Load (ETL) pipeline
- Data validation and quality checks
- Conditional logging based on data
- Comprehensive trace metadata
- Step-by-step progress reporting

**When to use:** Production ETL pipelines, data processing workflows, complex multi-step operations.

---

## 🚀 Running the Examples

### Prerequisites

1. **Kafka Running Locally:**
   ```bash
   # Using Docker Compose
   docker-compose up -d kafka
   
   # Or using Confluent CLI
   confluent local kafka start
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Build the SDK:**
   ```bash
   npm run build
   ```

### Run Individual Examples

```bash
# Run a specific example
npx ts-node examples/01-basic-usage.ts
npx ts-node examples/02-auto-close-steps.ts
npx ts-node examples/03-singleton-pattern.ts
npx ts-node examples/04-step-logging.ts
npx ts-node examples/05-error-handling.ts
npx ts-node examples/06-existing-kafka-instance.ts
npx ts-node examples/07-complex-workflow.ts
```

### Run All Examples

```bash
npx ts-node examples/index.ts
```

---

## 📖 Understanding the Output

Each example prints detailed console output showing:
- ✓ Success markers for completed operations
- → Arrow markers for in-progress operations
- ✗ Cross markers for failures
- Step numbers and status
- Trace IDs for correlation
- Timing information

Example output:
```
=== Example 01: Basic Usage ===

✓ Connected to Kafka

✓ Created trace: 550e8400-e29b-41d4-a716-446655440000

✓ Trace started

✓ Step 0: Fetch Users
  ✓ Step 0 completed

✓ Step 1: Transform Data
  ✓ Step 1 completed
  
✓ Trace finished successfully
```

---

## 🔍 Inspecting Kafka Messages

To see the actual messages sent to Kafka:

```bash
# Using Kafka CLI
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic traces \
  --from-beginning \
  --property print.key=true

# Using kcat (kafkacat)
kcat -b localhost:9092 -t traces -C -f 'Key: %k\nValue: %s\n'
```

---

## 🎯 Use Case Mapping

| Your Scenario | Recommended Examples |
|---------------|---------------------|
| First time using TraceFlow | 01-basic-usage |
| Setting up in production | 03-singleton-pattern |
| Don't want to manage step closing | 02-auto-close-steps |
| Need detailed logging | 04-step-logging |
| Handling errors gracefully | 05-error-handling |
| Already have Kafka setup | 06-existing-kafka-instance |
| Building ETL/data pipelines | 07-complex-workflow |

---

## 💡 Best Practices

Based on these examples, here are recommended patterns:

### 1. Use Singleton Pattern in Production
```typescript
// main.ts
initializeTraceFlow({ ... });

// anywhere.ts
const client = getTraceFlow();
```

### 2. Enable Auto-Close for Sequential Workflows
```typescript
const trace = await client.trace({ ... }, { autoCloseSteps: true });
```

### 3. Always Use Try-Catch for Error Handling
```typescript
try {
  await step.finish();
} catch (error) {
  await step.fail(error.message);
  await trace.fail(`Trace failed: ${error.message}`);
}
```

### 4. Add Rich Metadata for Observability
```typescript
const trace = await client.trace({
  job_type: 'etl',
  owner: 'data-team',
  tags: ['production', 'critical'],
  params: { date: '2024-10-24' },
  metadata: { env: 'prod', region: 'us-east-1' },
});
```

### 5. Log Liberally
```typescript
await step.info('Starting operation');
await step.debug('Config loaded', { config });
await step.warn('Slow response', { latency });
await step.finish({ records: 100 });
```

---

## 🤝 Contributing Examples

Have a great use case? Submit a PR with:
1. A new example file (e.g., `08-your-example.ts`)
2. Update this README with your example description
3. Add it to `examples/index.ts`

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/your-org/traceflow-sdk/issues)
- **Documentation:** [Main README](../README.md)
- **API Reference:** [README - API Reference](../README.md#api-reference)

