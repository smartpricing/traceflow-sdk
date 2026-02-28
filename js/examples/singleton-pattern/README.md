# Singleton Pattern Example

This example demonstrates how to use the TraceFlow client across your entire application using the **Singleton Pattern**.

## Key Benefits

✅ **Initialize Once**: Configure and connect the client once at application startup  
✅ **Use Everywhere**: Access the client from any part of your code without passing it around  
✅ **Clean Architecture**: No dependency injection needed, no prop drilling  
✅ **Type Safe**: Full TypeScript support with intellisense  

## File Structure

```
singleton-pattern/
├── 01-initialize-client.ts  # Initialize client at app startup
├── 02-use-in-service-a.ts   # UserService using TraceFlow
├── 03-use-in-service-b.ts   # OrderService using TraceFlow
├── 04-main-app.ts            # Main application entry point
└── README.md                 # This file
```

## How It Works

### 1. Initialize Once (01-initialize-client.ts)

Initialize the TraceFlow client once at application startup:

```typescript
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

export async function initializeTraceFlow() {
  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
    redisUrl: 'redis://localhost:6379',
    cleanerConfig: { enabled: true },
  });
  
  await client.connect();
}
```

### 2. Use Anywhere (02, 03-use-in-service-*.ts)

Then, in any service or module, simply get the singleton instance:

```typescript
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

export class UserService {
  async registerUser(email: string) {
    // Get the singleton instance - no initialization needed!
    const client = TraceFlowClient.getInstance();
    
    const trace = client.trace({
      trace_type: 'user_registration',
      title: `Register user: ${email}`,
    });
    
    // ... your business logic
  }
}
```

### 3. Run Application (04-main-app.ts)

Your main application just needs to:
1. Initialize TraceFlow once
2. Use your services normally
3. Shutdown gracefully

```typescript
async function main() {
  await initializeTraceFlow();
  
  const userService = new UserService();
  await userService.registerUser('john@example.com');
  
  await shutdownTraceFlow();
}
```

## Running the Example

1. **Start Dependencies**:
```bash
# Start Kafka
docker-compose up -d kafka

# Start Redis
docker-compose up -d redis
```

2. **Run the Example**:
```bash
npm run example:singleton
```

Or with ts-node:
```bash
npx ts-node examples/singleton-pattern/04-main-app.ts
```

## Real-World Usage

### Express.js Application

```typescript
// app.ts
import express from 'express';
import { initializeTraceFlow, shutdownTraceFlow } from './traceflow';

const app = express();

// Initialize TraceFlow at startup
app.listen(3000, async () => {
  await initializeTraceFlow();
  console.log('Server running on port 3000');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await shutdownTraceFlow();
  process.exit(0);
});
```

```typescript
// routes/users.ts
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';
import { Router } from 'express';

const router = Router();

router.post('/register', async (req, res) => {
  const client = TraceFlowClient.getInstance();
  const trace = client.trace({
    trace_type: 'user_registration',
    metadata: { email: req.body.email },
  });
  
  // ... handle registration
});

export default router;
```

### NestJS Application

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initializeTraceFlow, shutdownTraceFlow } from './traceflow';

async function bootstrap() {
  // Initialize TraceFlow
  await initializeTraceFlow();
  
  const app = await NestFactory.create(AppModule);
  
  // Graceful shutdown
  app.enableShutdownHooks();
  
  await app.listen(3000);
}

bootstrap();
```

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

@Injectable()
export class UserService {
  async registerUser(email: string) {
    const client = TraceFlowClient.getInstance();
    const trace = client.trace({
      trace_type: 'user_registration',
      metadata: { email },
    });
    
    // ... business logic
  }
}
```

### Kubernetes Deployment

When deployed in Kubernetes:

1. **Main Service Pod** (handles requests):
```typescript
await initializeTraceFlow({
  brokers: process.env.KAFKA_BROKERS?.split(',') || [],
  redisUrl: process.env.REDIS_URL,
  cleanerConfig: { enabled: false }, // Don't run cleaner in main pods
});
```

2. **Cron Job Pod** (cleanup):
```typescript
await initializeTraceFlow({
  brokers: process.env.KAFKA_BROKERS?.split(',') || [],
  redisUrl: process.env.REDIS_URL,
  cleanerConfig: { 
    enabled: true, // Run cleaner only in cron pod
    inactivityTimeoutSeconds: 3600,
    cleanupIntervalSeconds: 300,
  },
});
```

## Best Practices

1. **Always initialize before using**: Call `initializeTraceFlow()` before any service tries to use `getInstance()`

2. **Single initialization point**: Initialize the client in only one place (e.g., `main.ts`, `app.ts`, `index.ts`)

3. **Graceful shutdown**: Always call `shutdownTraceFlow()` when your application exits

4. **Environment configuration**: Use environment variables for configuration:
```typescript
const client = new TraceFlowClient({
  brokers: process.env.KAFKA_BROKERS?.split(',') || [],
  redisUrl: process.env.REDIS_URL,
});
```

5. **Error handling**: Wrap initialization in try-catch:
```typescript
try {
  await initializeTraceFlow();
} catch (error) {
  console.error('Failed to initialize TraceFlow:', error);
  process.exit(1);
}
```

## Troubleshooting

### "TraceFlowClient not initialized"

If you get this error, make sure you called `new TraceFlowClient()` before calling `getInstance()`:

```typescript
// ❌ Wrong - getInstance() called before initialization
const client = TraceFlowClient.getInstance(); // Error!

// ✅ Correct - Initialize first
await initializeTraceFlow();
const client = TraceFlowClient.getInstance(); // Works!
```

### Multiple Initializations

The singleton pattern allows only one instance. If you try to create a second instance, it will log a warning but still work:

```typescript
const client1 = new TraceFlowClient({ brokers: [...] });
const client2 = new TraceFlowClient({ brokers: [...] }); // Warning logged

// Both will reference the same instance
console.log(client1 === client2); // true
```

## Next Steps

- See [../README.md](../README.md) for more examples
- Read [../../README.md](../../README.md) for full API documentation
- Check [../../SERVICE_INTEGRATION.md](../../SERVICE_INTEGRATION.md) for production setup

