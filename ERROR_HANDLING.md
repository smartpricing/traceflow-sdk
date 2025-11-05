# Error Handling & State Validation

TraceFlow SDK provides comprehensive error handling and state validation to ensure data integrity and prevent invalid operations.

## Table of Contents

- [Overview](#overview)
- [Error Classes](#error-classes)
- [Duplicate Prevention](#duplicate-prevention)
- [State Validation](#state-validation)
- [Error Handling Best Practices](#error-handling-best-practices)
- [Examples](#examples)

## Overview

The SDK enforces strict state management rules to prevent:
- Operations on closed traces
- Operations on closed steps  
- Duplicate data when enabled
- Invalid state transitions

All validation errors are thrown as custom error classes that extend `TraceFlowError`, making them easy to identify and handle.

## Error Classes

### `TraceFlowError`

Base error class for all TraceFlow errors.

```typescript
import { TraceFlowError } from '@dev.smartpricing/traceflow-sdk';

try {
  // SDK operations
} catch (error) {
  if (error instanceof TraceFlowError) {
    // Handle TraceFlow-specific errors
  }
}
```

### `TraceClosedError`

Thrown when attempting to perform operations on a trace that is already completed, failed, or cancelled.

```typescript
import { TraceClosedError } from '@dev.smartpricing/traceflow-sdk';

try {
  await trace.step({ name: 'New Step' });
} catch (error) {
  if (error instanceof TraceClosedError) {
    console.error(`Trace is closed: ${error.message}`);
    // Error: "Trace trace_123 is already closed with status: success. Cannot perform further operations."
  }
}
```

**Prevented Operations:**
- `trace.update()`
- `trace.start()`
- `trace.step()`
- Any operation that modifies a closed trace

### `StepClosedError`

Thrown when attempting to perform operations on a step that is already completed or failed.

```typescript
import { StepClosedError } from '@dev.smartpricing/traceflow-sdk';

try {
  await step.update({ metadata: { progress: '100%' } });
} catch (error) {
  if (error instanceof StepClosedError) {
    console.error(`Step is closed: ${error.message}`);
    // Error: "Step 0 of trace trace_123 is already closed with status: completed. Cannot perform further operations."
  }
}
```

**Prevented Operations:**
- `step.update()`
- `step.complete()`
- `step.fail()`
- Any operation that modifies a closed step

### `DuplicateError`

Thrown when attempting to create a duplicate trace or step when `preventDuplicates` is enabled.

```typescript
import { DuplicateError } from '@dev.smartpricing/traceflow-sdk';

try {
  await client.trace({
    trace_id: 'existing_trace',
    title: 'Duplicate Trace',
  });
} catch (error) {
  if (error instanceof DuplicateError) {
    console.error(`Duplicate detected: ${error.message}`);
    // Error: "Trace existing_trace already exists. Duplicate prevention is enabled."
  }
}
```

### `ClientNotInitializedError`

Thrown when attempting to use the singleton instance before initialization.

```typescript
import { ClientNotInitializedError, TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

try {
  const client = TraceFlowClient.getInstance();
} catch (error) {
  if (error instanceof ClientNotInitializedError) {
    console.error('Client not initialized. Please call new TraceFlowClient() first.');
  }
}
```

### `RedisNotConfiguredError`

Thrown when attempting to use features that require Redis but Redis is not configured.

```typescript
import { RedisNotConfiguredError } from '@dev.smartpricing/traceflow-sdk';

try {
  await trace.initializeFromRedis();
} catch (error) {
  if (error instanceof RedisNotConfiguredError) {
    console.error(`Redis required: ${error.message}`);
    // Error: "Redis is not configured. Operation 'initializeFromRedis' requires Redis to be enabled."
  }
}
```

### `InvalidStateTransitionError`

Thrown when attempting an invalid state transition.

```typescript
import { InvalidStateTransitionError } from '@dev.smartpricing/traceflow-sdk';

try {
  // Attempting to transition from SUCCESS to RUNNING
  await trace.start(); // trace is already SUCCESS
} catch (error) {
  if (error instanceof InvalidStateTransitionError) {
    console.error(`Invalid transition: ${error.message}`);
    // Error: "Invalid state transition for trace: cannot transition from success to running."
  }
}
```

## Duplicate Prevention

### Configuration

Enable duplicate prevention by setting `preventDuplicates: true` in the client configuration:

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379', // Redis required for duplicate detection
  preventDuplicates: true, // Enable duplicate prevention
});
```

### Behavior

**When `preventDuplicates: false` (default):**
- New data **overwrites** existing data
- No duplicate checks performed
- Faster performance (no Redis lookups)

**When `preventDuplicates: true`:**
- Throws `DuplicateError` when attempting to recreate a closed trace
- Throws `DuplicateError` when attempting to recreate a closed step
- Allows updates to active (PENDING/RUNNING) traces
- Allows updates to open (STARTED/IN_PROGRESS) steps

### Examples

#### Without Duplicate Prevention (Default)

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
  preventDuplicates: false, // or omit (default)
});

// First trace
const trace1 = client.trace({
  trace_id: 'trace_123',
  title: 'First Trace',
});
await trace1.complete();

// Second trace with same ID - overwrites first
const trace2 = client.trace({
  trace_id: 'trace_123', // Same ID
  title: 'Second Trace', // Different title
});
// ✅ Works - overwrites previous trace
```

#### With Duplicate Prevention

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
  preventDuplicates: true, // Enable
});

// First trace
const trace1 = client.trace({
  trace_id: 'trace_123',
  title: 'First Trace',
});
await trace1.complete(); // Status: SUCCESS

// Attempt to create duplicate
try {
  const trace2 = client.trace({
    trace_id: 'trace_123', // Same ID
    title: 'Second Trace',
  });
  // ❌ Throws DuplicateError
} catch (error) {
  console.error(error.message);
  // "Trace trace_123 already exists. Duplicate prevention is enabled."
}
```

#### Updating Active Traces (Allowed)

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
  preventDuplicates: true,
});

// Create trace
const trace = client.trace({
  trace_id: 'trace_123',
  title: 'Active Trace',
});
await trace.start(); // Status: RUNNING

// Update the same trace - allowed because it's still active
await trace.update({
  metadata: { progress: '50%' },
});
// ✅ Works - trace is still active (RUNNING)
```

## State Validation

### Trace State Validation

Traces have three closed states: `SUCCESS`, `FAILED`, `CANCELLED`

Once a trace enters any of these states, no further operations are allowed:

```typescript
const trace = client.trace({ title: 'My Trace' });

// Perform operations
await trace.start(); // Status: RUNNING ✅
await trace.step({ name: 'Step 1' }); // ✅ Works

// Complete the trace
await trace.complete(); // Status: SUCCESS ✅

// Attempt further operations
try {
  await trace.step({ name: 'Step 2' });
  // ❌ Throws TraceClosedError
} catch (error) {
  console.error(error.message);
  // "Trace trace_xxx is already closed with status: success. Cannot perform further operations."
}
```

### Step State Validation

Steps have two closed states: `COMPLETED`, `FAILED`

Once a step enters any of these states, no further operations are allowed:

```typescript
const step = await trace.step({ name: 'My Step' });

// Perform operations
await step.update({ metadata: { progress: '50%' } }); // ✅ Works

// Complete the step
await step.complete({ output: { result: 'success' } }); // Status: COMPLETED ✅

// Attempt further operations
try {
  await step.update({ metadata: { progress: '100%' } });
  // ❌ Throws StepClosedError
} catch (error) {
  console.error(error.message);
  // "Step 0 of trace trace_xxx is already closed with status: completed. Cannot perform further operations."
}
```

### Checking State Before Operations

#### For Traces

```typescript
// Check if trace is still active
const isActive = await trace.isActive();
if (isActive) {
  await trace.step({ name: 'New Step' });
}
```

#### For Steps

```typescript
// Check if step is closed
if (!step.isClosed()) {
  await step.update({ metadata: { progress: '75%' } });
}

// Or check from Redis (more accurate for distributed systems)
const isClosed = await step.isClosedFromRedis();
if (!isClosed) {
  await step.complete();
}
```

## Error Handling Best Practices

### 1. Always Wrap SDK Operations in Try-Catch

```typescript
try {
  const trace = client.trace({ title: 'My Operation' });
  await trace.start();
  const step = await trace.step({ name: 'Step 1' });
  await step.complete();
  await trace.complete();
} catch (error) {
  if (error instanceof TraceClosedError) {
    console.log('Trace already completed - skipping');
  } else if (error instanceof StepClosedError) {
    console.log('Step already completed - skipping');
  } else if (error instanceof DuplicateError) {
    console.log('Duplicate detected - using existing trace');
  } else {
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

### 2. Check State Before Operations (Idempotency)

```typescript
async function processOrder(orderId: string) {
  const trace = client.trace({
    trace_id: `order_${orderId}`,
    title: `Process Order ${orderId}`,
  });

  // Check if already completed (idempotent)
  const isActive = await trace.isActive();
  if (!isActive) {
    console.log('Order already processed');
    return;
  }

  // Proceed with processing
  await trace.start();
  // ... process order
  await trace.complete();
}
```

### 3. Handle Duplicates Gracefully

```typescript
async function createTrace(traceId: string) {
  try {
    const trace = client.trace({
      trace_id: traceId,
      title: 'New Trace',
    });
    await trace.start();
    return trace;
  } catch (error) {
    if (error instanceof DuplicateError) {
      // Trace already exists, retrieve it instead
      console.log(`Trace ${traceId} already exists, using existing`);
      return client.getTrace(traceId);
    }
    throw error;
  }
}
```

### 4. Log Errors with Context

```typescript
async function processStep(trace: TraceManager, stepName: string) {
  try {
    const step = await trace.step({ name: stepName });
    await step.complete();
  } catch (error) {
    console.error(`Failed to process step "${stepName}":`, {
      traceId: trace.getId(),
      error: error.message,
      errorType: error.constructor.name,
    });
    
    if (error instanceof TraceClosedError || error instanceof StepClosedError) {
      // Already closed, safe to continue
      return;
    }
    
    throw error;
  }
}
```

### 5. Use Type Guards

```typescript
function isTraceFlowError(error: unknown): error is TraceFlowError {
  return error instanceof TraceFlowError;
}

function handleError(error: unknown) {
  if (!isTraceFlowError(error)) {
    // Not a TraceFlow error, handle differently
    console.error('Non-TraceFlow error:', error);
    return;
  }

  // Handle TraceFlow-specific errors
  if (error instanceof TraceClosedError) {
    // Handle closed trace
  } else if (error instanceof StepClosedError) {
    // Handle closed step
  } else if (error instanceof DuplicateError) {
    // Handle duplicate
  }
}
```

## Examples

### Example 1: Idempotent Trace Processing

```typescript
import { TraceFlowClient, TraceClosedError } from '@dev.smartpricing/traceflow-sdk';

async function processUserRegistration(userId: string, email: string) {
  const client = TraceFlowClient.getInstance();
  
  const trace = client.trace({
    trace_id: `user_reg_${userId}`,
    trace_type: 'user_registration',
    title: `Register user: ${email}`,
  });

  try {
    // Check if already processed
    const isActive = await trace.isActive();
    if (!isActive) {
      console.log(`User ${userId} already registered`);
      return { success: true, alreadyProcessed: true };
    }

    await trace.start();

    // Step 1: Validate
    const validateStep = await trace.step({ name: 'Validate' });
    // ... validation logic
    await validateStep.complete();

    // Step 2: Create user
    const createStep = await trace.step({ name: 'Create User' });
    // ... create user logic
    await createStep.complete();

    // Step 3: Send email
    const emailStep = await trace.step({ name: 'Send Welcome Email' });
    // ... send email logic
    await emailStep.complete();

    await trace.complete({ result: { userId, registered: true } });
    
    return { success: true, alreadyProcessed: false };

  } catch (error) {
    if (error instanceof TraceClosedError) {
      // Already completed by another process
      console.log('Registration completed by another process');
      return { success: true, alreadyProcessed: true };
    }
    
    // Handle other errors
    await trace.fail({ error: String(error) });
    throw error;
  }
}
```

### Example 2: Safe Step Updates with State Checking

```typescript
async function updateStepProgress(traceId: string, stepNumber: number, progress: number) {
  const client = TraceFlowClient.getInstance();
  const trace = client.getTrace(traceId);
  const step = trace.getStep(stepNumber);

  try {
    // Check state from Redis (accurate for distributed systems)
    const isClosed = await step.isClosedFromRedis();
    
    if (isClosed) {
      console.log(`Step ${stepNumber} already closed, skipping update`);
      return false;
    }

    await step.update({
      metadata: { progress: `${progress}%` },
    });

    if (progress >= 100) {
      await step.complete({ output: { finalProgress: 100 } });
    }

    return true;

  } catch (error) {
    if (error instanceof StepClosedError) {
      console.log('Step closed during update, operation complete');
      return false;
    }
    throw error;
  }
}
```

### Example 3: Handling Duplicates with preventDuplicates

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
  preventDuplicates: true, // Enable duplicate prevention
});

await client.connect();

async function startOrder(orderId: string) {
  try {
    const trace = client.trace({
      trace_id: `order_${orderId}`,
      trace_type: 'order_processing',
      title: `Process Order ${orderId}`,
    });

    await trace.start();
    
    return { trace, isNew: true };

  } catch (error) {
    if (error instanceof DuplicateError) {
      // Order already being processed
      console.log(`Order ${orderId} already exists, retrieving...`);
      
      const trace = client.getTrace(`order_${orderId}`);
      const isActive = await trace.isActive();
      
      if (!isActive) {
        throw new Error('Order already completed');
      }
      
      return { trace, isNew: false };
    }
    
    throw error;
  }
}
```

## Summary

The TraceFlow SDK provides comprehensive error handling and state validation to ensure:

✅ **Data Integrity** - Prevents operations on closed traces/steps  
✅ **Duplicate Prevention** - Optional duplicate detection and prevention  
✅ **Clear Errors** - Specific error classes for different failure scenarios  
✅ **Idempotent Operations** - Safe to retry operations  
✅ **Distributed Safety** - Redis-backed state checks for multi-instance environments  

For more information, see:
- [Main README](./README.md)
- [Service Integration Guide](./SERVICE_INTEGRATION.md)
- [Examples](./examples/README.md)

