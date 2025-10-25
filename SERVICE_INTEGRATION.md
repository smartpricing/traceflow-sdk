# TraceFlow SDK - Redis Integration Guide

This guide explains how to integrate Redis for state persistence and automatic cleanup of inactive traces.

## 🎯 Problem Solved

Without persistent state:
- ❌ Pod restart → lose all trace references
- ❌ Orphaned traces never completed
- ❌ Step numbering resets
- ❌ No timeout/cleanup

With Redis integration:
- ✅ State persists in Redis
- ✅ Resume traces after pod restart
- ✅ Query trace/step state
- ✅ Automatic cleanup of inactive traces

---

## 📋 Prerequisites

- **Redis Server**: Version 6.0+ recommended
- **TraceFlow Service**: Kafka consumer that persists messages to ScyllaDB
- **Kafka**: For message passing between SDK and service

---

## 🏗️ Architecture

```
┌─────────────────┐
│   Your Service  │
│   (SDK Client)  │
└────────┬────────┘
         │
         ├──► Kafka Topic 'traceflow'
         │    (send messages)
         │
         └──► Redis
              (persist state)
              
                    ↓
              
         ┌──────────────────┐
         │ TraceFlow Service│
         │ (Kafka Consumer) │
         └────────┬─────────┘
                  │
                  └──► ScyllaDB
                       (persist events)
```

**Key Points:**
- SDK sends messages to Kafka (events)
- SDK persists state to Redis (recovery)
- TraceFlow Service consumes Kafka and writes to ScyllaDB (historical data)

---

## 🔧 SDK Configuration

### Option 1: With Redis URL

```typescript
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379', // ← Add this for state persistence
}, 'my-service');

await client.connect();
```

### Option 2: With Existing Redis Client

```typescript
import { createClient } from 'redis';
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

const redisClient = createClient({ url: 'redis://localhost:6379' });
await redisClient.connect();

const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisClient, // Use existing Redis client
}, 'my-service');

await client.connect();
```

### Option 3: Without Redis (Dev/Simple Use Cases)

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  // No Redis - no state recovery, in-memory only
}, 'my-service');
```

---

## 📝 Usage Examples

### Example 1: Basic Usage (Automatic State Persistence)

```typescript
// Redis configured - state automatically persisted
const trace = await client.trace({ trace_type: 'sync' });
await trace.start();

const step = await trace.step({ name: 'Process' });
await step.finish();

await trace.finish();

// State is in Redis! No extra code needed.
```

### Example 2: Resume After Pod Restart

```typescript
// === POD 1 (before crash) ===
const trace = await client.trace({ trace_type: 'etl', title: 'ETL Job' });
const traceId = trace.getId(); 

// Save trace ID somewhere accessible after restart
// (environment variable, file, external Redis key, etc.)
process.env.CURRENT_TRACE_ID = traceId;

await trace.start();
const step1 = await trace.step({ name: 'Extract' });
// ... pod crashes ...

// === POD 2 (after restart) ===
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
}, 'my-service');

await client.connect();

// Resume the trace
const traceId = process.env.CURRENT_TRACE_ID;
const trace = client.getTrace(traceId);

// Initialize step numbering from Redis
await trace.initializeFromRedis();

// Continue where we left off
const step2 = await trace.step({ name: 'Transform' });
await step2.finish();

await trace.finish();
```

### Example 3: Check State from Redis

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
}, 'my-service');

await client.connect();

// Check if Redis is configured
if (client.hasRedisClient()) {
  const redisClient = client.getRedisClient()!;
  
  // Get trace state
  const traceState = await redisClient.getTrace('trace-uuid');
  console.log(`Trace status: ${traceState?.status}`);
  
  // Get all steps
  const steps = await redisClient.getSteps('trace-uuid');
  console.log(`Found ${steps.length} steps`);
  
  // Check if specific step is closed
  const isClosed = await redisClient.isStepClosed('trace-uuid', 0);
  console.log(`Step 0 closed: ${isClosed}`);
}
```

### Example 4: Complete Open Steps After Restart

```typescript
// After pod restart, resume trace
const trace = client.getTrace(savedTraceId);
await trace.initializeFromRedis();

// Get Redis client
const redisClient = client.getRedisClient()!;

// Find all open steps
const steps = await redisClient.getSteps(savedTraceId);
const openSteps = steps.filter(s => 
  s.status === 'STARTED' || s.status === 'IN_PROGRESS'
);

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

## 🧹 Automatic Cleanup Integration

The SDK includes an integrated cleaner that automatically closes inactive traces stored in Redis.

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
  redisUrl: 'redis://localhost:6379',
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
  redisUrl: 'redis://localhost:6379', // Required!
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
      - REDIS_URL=redis://redis:6379
    depends_on:
      - kafka
      - redis

  # Cron service - cleanup only
  cron-cleaner:
    build: ./cron-service
    environment:
      - KAFKA_BROKERS=kafka:9092
      - REDIS_URL=redis://redis:6379
      - CLEANUP_TIMEOUT_SECONDS=1800
      - CLEANUP_INTERVAL_SECONDS=300
    depends_on:
      - kafka
      - redis

  # TraceFlow service - Kafka consumer → ScyllaDB
  traceflow-service:
    build: ./traceflow-service
    environment:
      - KAFKA_BROKERS=kafka:9092
      - SCYLLA_HOSTS=scylla:9042
    depends_on:
      - kafka
      - scylla

  # Redis for state
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  # Kafka
  kafka:
    image: confluentinc/cp-kafka:latest
    # ... kafka config ...

  # ScyllaDB
  scylla:
    image: scylladb/scylla:latest
    # ... scylla config ...

volumes:
  redis-data:
```

### Environment-Based Configuration

```typescript
const isCronService = process.env.SERVICE_TYPE === 'cron';

const client = initializeTraceFlow({
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  redisUrl: process.env.REDIS_URL,
  // Only enable cleaner in cron service
  ...(isCronService && {
    cleanerConfig: {
      inactivityTimeoutSeconds: parseInt(process.env.CLEANUP_TIMEOUT_SECONDS || '1800'),
      cleanupIntervalSeconds: parseInt(process.env.CLEANUP_INTERVAL_SECONDS || '300'),
      autoStart: true,
    },
  }),
}, process.env.SERVICE_NAME || 'service');

await client.connect();
```

### Manual Control (Advanced)

```typescript
const client = initializeTraceFlow({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
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

## 📊 Redis Data Structure

The SDK stores data in Redis using these key patterns:

### Trace State

**Key:** `trace:{trace_id}`  
**Type:** Hash

```
HGETALL trace:abc-123
{
  trace_id: "abc-123",
  trace_type: "sync",
  status: "RUNNING",
  source: "my-service",
  created_at: "2024-01-01T10:00:00Z",
  updated_at: "2024-01-01T10:05:00Z",
  last_activity_at: "2024-01-01T10:05:00Z",
  title: "Data Sync",
  ...
}
```

### Step State

**Key:** `trace:{trace_id}:step:{step_number}`  
**Type:** Hash

```
HGETALL trace:abc-123:step:0
{
  trace_id: "abc-123",
  step_number: "0",
  step_id: "def-456",
  name: "Process Data",
  status: "COMPLETED",
  started_at: "2024-01-01T10:01:00Z",
  finished_at: "2024-01-01T10:05:00Z",
  last_activity_at: "2024-01-01T10:05:00Z",
  ...
}
```

### Activity Tracking (for Cleaner)

**Traces Activity:**  
**Key:** `traces:activity`  
**Type:** Sorted Set  
**Score:** Timestamp of `last_activity_at`  
**Value:** `trace_id`

```
ZRANGE traces:activity 0 -1 WITHSCORES
```

**Steps Activity:**  
**Key:** `trace:{trace_id}:steps:activity`  
**Type:** Sorted Set  
**Score:** Timestamp of `last_activity_at`  
**Value:** `step_number`

---

## 🔄 How TraceCleaner Works

1. **Periodic Check**: Runs every `cleanupIntervalSeconds` (default: 300s)
2. **Query Redis**: Gets traces with `last_activity_at` older than `inactivityTimeoutSeconds` (default: 1800s)
3. **For Each Inactive Trace**:
   - Query Redis for open steps
   - Send Kafka message to close each step (status: FAILED)
   - Send Kafka message to close trace (status: FAILED)
4. **Logging**: Detailed logs for debugging

---

## 🛠️ Implementation Steps

### Step 1: Add Redis to Your Infrastructure

```bash
# Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine redis-server --appendonly yes

# Or use Docker Compose (see example above)
```

### Step 2: Update Your Service Configuration

```typescript
// your-service/config.ts
const config = {
  traceflow: {
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
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
import Redis from 'ioredis'; // or 'redis'

async function bootstrap() {
  const tracingClient = await initTracing();
  
  // Store current trace ID in external Redis (not SDK Redis)
  // So you can resume after restart
  const externalRedis = new Redis(process.env.REDIS_URL);
  
  // Check for existing traces to resume
  const existingTraceId = await externalRedis.get('current_trace_id');
  
  if (existingTraceId && tracingClient.hasRedisClient()) {
    console.log('Resuming trace:', existingTraceId);
    
    const trace = tracingClient.getTrace(existingTraceId);
    await trace.initializeFromRedis();
    
    // Continue processing...
  }
}
```

---

## 🎯 Best Practices

### 1. Always Initialize from Redis When Resuming

```typescript
const trace = client.getTrace(traceId);
await trace.initializeFromRedis(); // ← Important!
```

### 2. Check Redis Availability

```typescript
if (client.hasRedisClient()) {
  // Safe to use Redis features
  await trace.initializeFromRedis();
} else {
  // Fall back to in-memory only
  console.warn('Redis not configured, state will not persist');
}
```

### 3. Store Trace IDs for Recovery

```typescript
// Option A: Environment variable
process.env.CURRENT_TRACE_ID = trace.getId();

// Option B: External Redis
await externalRedis.set('current_trace', trace.getId(), 'EX', 3600);

// Option C: File (simple but works)
fs.writeFileSync('/tmp/current_trace.txt', trace.getId());
```

### 4. Handle Redis Errors Gracefully

```typescript
try {
  await trace.initializeFromRedis();
} catch (error) {
  console.warn('Failed to initialize from Redis:', error);
  // Continue with in-memory state
}
```

### 5. Use Separate Redis for SDK vs Application

```typescript
// SDK Redis (managed by SDK)
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379/0', // DB 0 for SDK
});

// Your application Redis
const appRedis = new Redis('redis://localhost:6379/1'); // DB 1 for app
```

---

## 🚀 Migration Guide

### If you're currently using the SDK without Redis:

1. Add `redisUrl` to your configuration
2. Deploy updated code
3. No breaking changes - works immediately
4. Existing traces continue in-memory, new ones persist

### If you have existing traces:

- Old traces (created without Redis) will continue working in-memory
- New traces (created with Redis) will have state recovery
- Gradually migrate by enabling `redisUrl` in config

---

## 📊 Benefits Summary

| Feature | Without Redis | With Redis |
|---------|--------------|------------|
| State persistence | ❌ | ✅ |
| Pod restart recovery | ❌ | ✅ |
| Query trace state | ❌ | ✅ |
| Auto cleanup | ❌ | ✅ |
| Multi-pod coordination | ❌ | ✅ |
| Step number recovery | ❌ | ✅ |

---

## 📈 Performance Considerations

- **Redis Operations**: Non-blocking, async
- **Overhead**: Minimal (~2-5ms per operation)
- **Network**: Local Redis recommended for best performance
- **Memory**: Redis memory usage depends on trace volume
  - Average trace: ~1-2KB
  - Average step: ~500B-1KB
  - Use TTL or cleanup to manage memory

---

## 🔗 Related Documentation

- [Main SDK README](./README.md)
- [API Reference](./README.md#api-reference)
- [TraceCleaner Documentation](./README.md#trace-cleaner)

---

## ❓ FAQ

**Q: Do I need to change existing code?**  
A: No, just add `redisUrl` to config. Everything else works the same.

**Q: What if Redis is down?**  
A: SDK falls back to in-memory state. Warnings logged but no errors. Tracing continues.

**Q: Can I use Redis for some traces but not others?**  
A: Yes, configure per-client. Some clients with `redisUrl`, others without.

**Q: Performance impact?**  
A: Minimal. Redis operations are async and non-blocking (~2-5ms overhead).

**Q: Do I need Redis for development?**  
A: No, omit `redisUrl` in dev. Use it only in staging/production.

**Q: Can I use Redis Cluster?**  
A: Yes, pass the cluster URL to `redisUrl`.

**Q: How long does Redis keep the state?**  
A: Indefinitely unless you set TTL or use the TraceCleaner to close inactive traces.

