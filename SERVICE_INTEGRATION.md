# TraceFlow SDK - Integration with TraceFlow Service

This guide explains how to integrate the SDK with your existing `traceflow-service` for state persistence and recovery.

## 🎯 Problem Solved

Without persistent state:
- ❌ Pod restart → lose all trace references
- ❌ Orphaned traces never completed
- ❌ Step numbering resets
- ❌ No timeout/cleanup

With traceflow-service integration:
- ✅ State persists in Scylla
- ✅ Resume traces after pod restart
- ✅ Query trace/step state
- ✅ Automatic cleanup possible

---

## 📋 Prerequisites

Your `traceflow-service` should expose REST API endpoints:

```typescript
// GET /api/traces/:traceId
// Response: TraceState

// GET /api/traces/:traceId/steps
// Response: StepState[]

// GET /api/traces/:traceId/steps/:stepNumber
// Response: StepState

// GET /api/traces/inactive?seconds=1800&minutes=30&statuses=IN_PROGRESS&limit=100
// Response: { traces: InactiveTrace[] }
// For TraceCleaner - returns traces inactive for specified time
// Parameters:
//   - seconds: inactivity timeout in seconds (required by SDK)
//   - minutes: alternative to seconds (optional, service can support both)
//   - statuses: comma-separated list of statuses to filter (optional)
//   - limit: max number of traces to return (optional)

// GET /api/traces/:traceId/steps/inactive?seconds=1800&minutes=30&statuses=IN_PROGRESS
// Response: { steps: InactiveStep[] }
// For TraceCleaner - returns inactive steps for a trace
// Parameters:
//   - seconds: inactivity timeout in seconds (required by SDK)
//   - minutes: alternative to seconds (optional, service can support both)
//   - statuses: comma-separated list of statuses to filter (optional)
```

---

## 🔧 SDK Configuration

### Option 1: With Service URL (Recommended for Production)

```typescript
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000/api', // ← Add this
}, 'my-service');

await client.connect();
```

### Option 2: Without Service URL (Dev/Simple Use Cases)

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  // No serviceUrl - no state recovery
}, 'my-service');
```

---

## 📝 Usage Examples

### Example 1: Basic Usage (No Changes Needed)

```typescript
// Works the same with or without service
const trace = await client.trace({ trace_type: 'sync' });
await trace.start();

const step = await trace.step({ name: 'Process' });
await step.finish();

await trace.finish();
```

### Example 2: Resume After Pod Restart

```typescript
// === POD 1 (before crash) ===
const trace = await client.trace({ trace_type: 'etl', title: 'ETL Trace' });
const traceId = trace.getId(); // Save this somewhere (env, redis, etc.)

await trace.start();
const step1 = await trace.step({ name: 'Extract' });
// ... pod crashes ...

// === POD 2 (after restart) ===
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000/api',
}, 'my-service');

await client.connect();

// Resume the trace
const trace = client.getTrace(traceId);

// Initialize step numbering from service
await trace.initializeFromService();

// Continue where we left off
const step2 = await trace.step({ name: 'Transform' });
await step2.finish();
```

### Example 3: Check Step State from Service

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000/api',
});

// Check if service is configured
if (client.hasServiceClient()) {
  const serviceClient = client.getServiceClient()!;
  
  // Get trace state
  const traceState = await serviceClient.getTrace('trace-uuid');
  console.log(`Trace status: ${traceState?.status}`);
  
  // Get all steps
  const steps = await serviceClient.getSteps('trace-uuid');
  console.log(`Found ${steps.length} steps`);
  
  // Check if specific step is closed
  const isClosed = await serviceClient.isStepClosed('trace-uuid', 0);
  console.log(`Step 0 closed: ${isClosed}`);
}
```

### Example 4: Complete Open Steps After Restart

```typescript
// After pod restart, resume trace
const trace = client.getTrace(savedTraceId);
await trace.initializeFromService();

// Get service client
const serviceClient = client.getServiceClient()!;

// Find all open steps
const steps = await serviceClient.getSteps(savedTraceId);
const openSteps = steps.filter(s => s.status === 'STARTED' || s.status === 'IN_PROGRESS');

// Complete them
for (const openStep of openSteps) {
  const step = trace.getStep(openStep.step_number);
  await step.info('Completing after restart...');
  await step.finish({ recovered: true });
}

// Finish trace
await trace.finish();
```

---

## 🏗️ Required traceflow-service API

Your `traceflow-service` needs these endpoints:

### GET /api/traces/:traceId

```typescript
// Response
{
  trace_id: string;
  trace_type?: string;
  status: string;
  source?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  last_activity_at?: string;
  // ... other fields
}
```

### GET /api/traces/:traceId/steps

```typescript
// Response
[
  {
    trace_id: string;
    step_number: number;
    step_id: string;
    name?: string;
    status: string;
    started_at: string;
    updated_at: string;
    finished_at?: string;
    last_activity_at?: string;
  },
  // ... more steps
]
```

### GET /api/traces/:traceId/steps/:stepNumber

```typescript
// Response
{
  trace_id: string;
  step_number: number;
  step_id: string;
  status: string;
  // ... other fields
}
```

---

## 🔄 Recommended Architecture

```
┌─────────────────┐
│   Your Service  │
│   (SDK Client)  │
└────────┬────────┘
         │
         ├──► Kafka Topic 'traceflow'
         │    (send messages)
         │
         └──► TraceFlow Service API
              (query state)
              
                    │
                    ├──► Kafka Consumer
                    │    (read messages)
                    │
                    └──► ScyllaDB
                         (persist state)
```

---

## 🛠️ Implementation Steps

### Step 1: Add REST API to traceflow-service

```typescript
// traceflow-service/src/api/routes.ts
import express from 'express';

const router = express.Router();

// Get trace by ID
router.get('/traces/:traceId', async (req, res) => {
  const { traceId } = req.params;
  
  const query = 'SELECT * FROM traces WHERE trace_id = ?';
  const result = await cassandra.execute(query, [traceId]);
  
  if (result.rowLength === 0) {
    return res.status(404).json({ error: 'Trace not found' });
  }
  
  res.json(result.first());
});

// Get steps for trace
router.get('/traces/:traceId/steps', async (req, res) => {
  const { traceId } = req.params;
  
  const query = 'SELECT * FROM steps WHERE trace_id = ? ORDER BY step_number ASC';
  const result = await cassandra.execute(query, [traceId]);
  
  res.json(result.rows);
});

// Get specific step
router.get('/traces/:traceId/steps/:stepNumber', async (req, res) => {
  const { traceId, stepNumber } = req.params;
  
  const query = 'SELECT * FROM steps WHERE trace_id = ? AND step_number = ?';
  const result = await cassandra.execute(query, [traceId, parseInt(stepNumber)]);
  
  if (result.rowLength === 0) {
    return res.status(404).json({ error: 'Step not found' });
  }
  
  res.json(result.first());
});

// Get inactive traces (for TraceCleaner)
router.get('/traces/inactive', async (req, res) => {
  const { seconds, minutes, statuses, limit } = req.query;
  
  // Calculate timeout from seconds or minutes
  let timeoutMs;
  if (seconds) {
    timeoutMs = parseInt(seconds) * 1000;
  } else if (minutes) {
    timeoutMs = parseInt(minutes) * 60 * 1000;
  } else {
    timeoutMs = 1800 * 1000; // Default: 30 minutes
  }
  
  const inactivityThreshold = new Date(Date.now() - timeoutMs);
  
  // Parse statuses filter (default: IN_PROGRESS)
  const statusFilter = statuses ? statuses.split(',') : ['IN_PROGRESS'];
  
  // Parse limit (default: 100)
  const maxLimit = limit ? parseInt(limit) : 100;
  
  // Find traces that haven't been updated recently
  const query = `
    SELECT trace_id, trace_name, updated_at, metadata, status
    FROM traces
    WHERE status IN ?
    AND updated_at < ?
    LIMIT ?
    ALLOW FILTERING
  `;
  
  const result = await cassandra.execute(query, [
    statusFilter,
    inactivityThreshold,
    maxLimit,
  ]);
  
  res.json({ traces: result.rows });
});

// Get inactive steps for a trace (for TraceCleaner)
router.get('/traces/:traceId/steps/inactive', async (req, res) => {
  const { traceId } = req.params;
  const { seconds, minutes, statuses } = req.query;
  
  // Calculate timeout from seconds or minutes
  let timeoutMs;
  if (seconds) {
    timeoutMs = parseInt(seconds) * 1000;
  } else if (minutes) {
    timeoutMs = parseInt(minutes) * 60 * 1000;
  } else {
    timeoutMs = 1800 * 1000; // Default: 30 minutes
  }
  
  const inactivityThreshold = new Date(Date.now() - timeoutMs);
  
  // Parse statuses filter (default: IN_PROGRESS)
  const statusFilter = statuses ? statuses.split(',') : ['IN_PROGRESS'];
  
  const query = `
    SELECT trace_id, step_number, step_name, status, updated_at
    FROM steps
    WHERE trace_id = ?
    AND status IN ?
    AND updated_at < ?
    ALLOW FILTERING
  `;
  
  const result = await cassandra.execute(query, [
    traceId,
    statusFilter,
    inactivityThreshold,
  ]);
  
  res.json({ steps: result.rows });
});

export default router;
```

### Step 2: Update Your Service Configuration

```typescript
// your-service/config.ts
const config = {
  traceflow: {
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    serviceUrl: process.env.TRACEFLOW_SERVICE_URL || 'http://traceflow-service:3000/api',
  },
};

// your-service/tracing.ts
import { initializeTraceFlow } from '@dev.smartpricing/traceflow-sdk';

export const initTracing = async () => {
  const client = initializeTraceFlow(config.traceflow, 'my-service');
  await client.connect();
  return client;
};
```

### Step 3: Handle Pod Restart

```typescript
// your-service/index.ts
import { initTracing } from './tracing';

async function bootstrap() {
  const tracingClient = await initTracing();
  
  // Store current trace IDs in Redis or environment
  // So you can resume them after restart
  
  // Check for existing traces to resume
  const existingTraceId = process.env.RESUME_TRACE_ID;
  
  if (existingTraceId && tracingClient.hasServiceClient()) {
    console.log('Resuming trace:', existingTraceId);
    
    const trace = tracingClient.getTrace(existingTraceId);
    await trace.initializeFromService();
    
    // Continue processing...
  }
}
```

---

## 🎯 Best Practices

### 1. Always Initialize from Service When Resuming

```typescript
const trace = client.getTrace(traceId);
await trace.initializeFromService(); // ← Important!
```

### 2. Check Service Availability

```typescript
if (client.hasServiceClient()) {
  // Safe to use service features
  await trace.initializeFromService();
} else {
  // Fall back to in-memory only
  console.warn('Service not configured, state will not persist');
}
```

### 3. Store Trace IDs for Recovery

```typescript
// Option A: Environment variable
process.env.CURRENT_TRACE_ID = trace.getId();

// Option B: Redis
await redis.set('current_trace', trace.getId(), 'EX', 3600);

// Option C: File (simple but works)
fs.writeFileSync('/tmp/current_trace.txt', trace.getId());
```

### 4. Handle Service Errors Gracefully

```typescript
try {
  await trace.initializeFromService();
} catch (error) {
  console.warn('Failed to initialize from service:', error);
  // Continue with in-memory state
}
```

---

## 🧹 Automatic Cleanup Integration

The SDK includes an integrated cleaner that automatically closes inactive traces. This requires the service integration.

### Setup Pattern

**Separation of Concerns:**
- **Main Service**: Handles tracing, cleaner **disabled**
- **Cron Service**: Handles cleanup, cleaner **enabled**

### Main Service Configuration

```typescript
// main-service/src/index.ts
import { initializeTraceFlow } from '@dev.smartpricing/traceflow-sdk';

const client = initializeTraceFlow({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000',
  // NO cleanerConfig - cleaner disabled
}, 'main-service');

await client.connect();

// Use for tracing...
const trace = await client.trace({ trace_type: 'etl' });
```

### Cron Service Configuration

```typescript
// cron-service/src/index.ts
import { initializeTraceFlow } from '@dev.smartpricing/traceflow-sdk';

const client = initializeTraceFlow({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000', // Required!
  cleanerConfig: {
    inactivityTimeoutSeconds: 1800,  // Close after 30 minutes
    cleanupIntervalSeconds: 300,     // Run every 5 minutes
    autoStart: true,                 // Start on connect
    logger: (message, data) => {
      console.log(`[Cleaner] ${message}`, data || '');
    },
  },
}, 'cron-cleaner');

await client.connect(); // Cleaner starts automatically

console.log('Cleaner active:', client.hasActiveCleaner()); // true

// Keep service running
process.on('SIGINT', async () => {
  await client.disconnect(); // Stops cleaner automatically
  process.exit(0);
});
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  # Main service - tracing only
  main-service:
    build: ./main-service
    environment:
      - KAFKA_BROKERS=kafka:9092
      - TRACEFLOW_SERVICE_URL=http://traceflow-service:3000
    depends_on:
      - kafka
      - traceflow-service

  # Cron service - cleanup only
  cron-cleaner:
    build: ./cron-service
    environment:
      - KAFKA_BROKERS=kafka:9092
      - TRACEFLOW_SERVICE_URL=http://traceflow-service:3000
      - CLEANUP_TIMEOUT_SECONDS=1800
      - CLEANUP_INTERVAL_SECONDS=300
    depends_on:
      - kafka
      - traceflow-service

  # TraceFlow service - API + Kafka consumer
  traceflow-service:
    build: ./traceflow-service
    environment:
      - KAFKA_BROKERS=kafka:9092
      - SCYLLA_HOSTS=scylla:9042
    ports:
      - "3000:3000"
    depends_on:
      - kafka
      - scylla
```

### Environment-Based Configuration

```typescript
const isCronService = process.env.SERVICE_TYPE === 'cron';

const client = initializeTraceFlow({
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  serviceUrl: process.env.TRACEFLOW_SERVICE_URL,
  // Only enable cleaner in cron service
  ...(isCronService && {
    cleanerConfig: {
      inactivityTimeoutSeconds: parseInt(process.env.CLEANUP_TIMEOUT_SECONDS || '1800'),
      cleanupIntervalSeconds: parseInt(process.env.CLEANUP_INTERVAL_SECONDS || '300'),
      autoStart: true,
    },
  }),
}, process.env.SERVICE_NAME || 'service');
```

### Manual Control (Advanced)

```typescript
const client = initializeTraceFlow({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000',
  cleanerConfig: {
    inactivityTimeoutSeconds: 1800,
    cleanupIntervalSeconds: 300,
    autoStart: false, // Don't start automatically
  },
}, 'cron-service');

await client.connect();

// Get cleaner for manual control
const cleaner = client.getCleaner();

// Start manually
cleaner?.start();

// Trigger immediate cleanup
await cleaner?.runCleanup();

// Stop
cleaner?.stop();
```

---

## 🚀 Migration Guide

### If you're currently using the SDK without service:

1. Add `serviceUrl` to your configuration
2. Deploy updated code
3. No breaking changes - works immediately

### If you have existing traces:

- Old traces (created without service) will continue working
- New traces (created with service) will have state recovery
- Gradually migrate by enabling `serviceUrl` in config

---

## 📊 Benefits Summary

| Feature | Without Service | With Service |
|---------|----------------|--------------|
| State persistence | ❌ | ✅ |
| Pod restart recovery | ❌ | ✅ |
| Query trace state | ❌ | ✅ |
| Auto cleanup | ❌ | ✅ (service handles) |
| Multi-pod coordination | ❌ | ✅ |
| Historical queries | ❌ | ✅ |

---

## 🔗 Related Documentation

- [Examples README](./README.md)
- [Main SDK README](../README.md)
- [State Recovery Example](./09-state-recovery.ts)

---

## ❓ FAQ

**Q: Do I need to change existing code?**  
A: No, just add `serviceUrl` to config. Everything else works the same.

**Q: What if service is down?**  
A: SDK falls back to in-memory state. Warnings logged but no errors.

**Q: Can I use service for some traces but not others?**  
A: Yes, configure per-client. Some clients with `serviceUrl`, others without.

**Q: Performance impact?**  
A: Minimal. Service queries are optional and only when explicitly called (e.g., `initializeFromService()`).

**Q: Do I need service for development?**  
A: No, omit `serviceUrl` in dev. Use it only in staging/production.

