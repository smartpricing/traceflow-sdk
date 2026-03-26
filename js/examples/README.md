# TraceFlow SDK Examples

This directory contains comprehensive examples demonstrating how to use the TraceFlow SDK in various scenarios.

## Available Examples

### [Singleton Pattern](./singleton-pattern/README.md) 🎯

**Recommended for most applications**

Learn how to initialize the TraceFlow client once at application startup and reuse it throughout your entire codebase without passing it around.

**Perfect for:**
- Express.js applications
- NestJS applications
- Any Node.js service architecture
- Microservices
- Kubernetes deployments

**Files:**
- `01-initialize-client.ts` - Initialize once at startup
- `02-use-in-service-a.ts` - Use in UserService
- `03-use-in-service-b.ts` - Use in OrderService
- `04-main-app.ts` - Complete application example

**Key Benefits:**
- ✅ Initialize once, use everywhere
- ✅ No dependency injection needed
- ✅ Clean and simple architecture
- ✅ Full TypeScript support

---

## Quick Start

Each example directory contains:
- **Source files**: TypeScript examples with detailed comments
- **README.md**: Comprehensive documentation for the example
- **Running instructions**: How to execute the example

## Prerequisites

Before running examples, make sure you have:

1. **Kafka** running (locally or remote)
2. **Redis** running (for state persistence)
3. **Dependencies** installed:
   ```bash
   npm install
   ```

### Quick Setup with Docker

```bash
# Start Kafka and Redis
docker-compose up -d
```

## Running Examples

### Individual Examples

Navigate to an example directory and run:

```bash
# Using ts-node
npx ts-node examples/singleton-pattern/04-main-app.ts

# Or using npm scripts (if configured)
npm run example:singleton
```

## Common Patterns

### Initialize Client

```typescript
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
});

await client.connect();
```

### Create and Manage Traces

```typescript
const trace = client.trace({
  trace_type: 'user_operation',
  title: 'Process User Registration',
});

const step = await trace.step({ name: 'Validate Input' });
await step.complete({ output: { valid: true } });

await trace.complete({ result: { success: true } });
```

### Resume Traces After Restart

```typescript
// After pod restart, get existing trace
const trace = client.getTrace('trace_12345');

// Check if still active
const isActive = await trace.isActive();

if (isActive) {
  // Continue processing
  const step = await trace.step({ name: 'Resume Processing' });
  await step.complete();
  await trace.complete();
}
```

## Configuration Examples

### Basic Configuration

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  topic: 'traceflow', // Optional, defaults to 'traceflow'
  redisUrl: 'redis://localhost:6379',
});
```

### With Authentication

```typescript
const client = new TraceFlowClient({
  brokers: ['kafka-1.example.com:9092', 'kafka-2.example.com:9092'],
  sasl: {
    mechanism: 'plain',
    username: 'your-username',
    password: 'your-password',
  },
  ssl: true,
  redisUrl: 'redis://username:password@redis.example.com:6379',
});
```

### With Automatic Cleanup

```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
  cleanerConfig: {
    enabled: true,
    inactivityTimeoutSeconds: 3600, // Close traces inactive for 1 hour
    cleanupIntervalSeconds: 300, // Check every 5 minutes
  },
});
```

### With Existing Kafka Instance

```typescript
import { Kafka } from '@confluentinc/kafka-javascript';

const kafka = new Kafka({
  kafkaJS: {
    brokers: ['localhost:9092'],
    clientId: 'my-app',
  },
});

const client = new TraceFlowClient({
  kafka,
  redisUrl: 'redis://localhost:6379',
});
```

## Environment Variables

Create a `.env` file for easy configuration:

```bash
# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=traceflow-sdk
KAFKA_TOPIC=traceflow

# Kafka Authentication (optional)
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=your-username
KAFKA_SASL_PASSWORD=your-password
KAFKA_SSL=true

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Cleaner Configuration (optional)
CLEANER_ENABLED=true
CLEANER_TIMEOUT=3600
CLEANER_INTERVAL=300
```

Then in your code:

```typescript
import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

const client = new TraceFlowClient({
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  topic: process.env.KAFKA_TOPIC || 'traceflow',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sasl: process.env.KAFKA_SASL_USERNAME ? {
    mechanism: process.env.KAFKA_SASL_MECHANISM as any,
    username: process.env.KAFKA_SASL_USERNAME,
    password: process.env.KAFKA_SASL_PASSWORD!,
  } : undefined,
  ssl: process.env.KAFKA_SSL === 'true',
  cleanerConfig: process.env.CLEANER_ENABLED === 'true' ? {
    enabled: true,
    inactivityTimeoutSeconds: parseInt(process.env.CLEANER_TIMEOUT || '3600'),
    cleanupIntervalSeconds: parseInt(process.env.CLEANER_INTERVAL || '300'),
  } : undefined,
});
```

## Best Practices

1. **Always use the Singleton Pattern** for most applications (see [singleton-pattern](./singleton-pattern/))

2. **Initialize once at startup** in your main application file (e.g., `app.ts`, `main.ts`, `index.ts`)

3. **Use environment variables** for configuration to support different environments (dev, staging, prod)

4. **Enable cleanup in dedicated cron pods** - not in your main application pods:
   ```typescript
   // Main app: cleanerConfig: { enabled: false }
   // Cron pod: cleanerConfig: { enabled: true }
   ```

5. **Always await connect()** before using the client:
   ```typescript
   const client = new TraceFlowClient({ ... });
   await client.connect(); // Important!
   ```

6. **Gracefully shutdown** when your app exits:
   ```typescript
   process.on('SIGTERM', async () => {
     await client.disconnect();
     process.exit(0);
   });
   ```

7. **Use Redis for state persistence** to handle pod restarts gracefully

8. **Add comprehensive metadata** to traces and steps for better debugging:
   ```typescript
   const trace = client.trace({
     trace_type: 'order_processing',
     title: `Order ${orderId}`,
     metadata: {
       orderId,
       userId,
       environment: process.env.NODE_ENV,
     },
   });
   ```

## Troubleshooting

### Connection Issues

If you can't connect to Kafka or Redis:

1. Check if services are running:
   ```bash
   # Kafka
   docker ps | grep kafka
   
   # Redis
   docker ps | grep redis
   ```

2. Test connectivity:
   ```bash
   # Kafka
   telnet localhost 9092
   
   # Redis
   redis-cli ping
   ```

3. Check logs:
   ```bash
   docker logs <container-id>
   ```

### TypeScript Errors

If you get TypeScript errors:

```bash
# Rebuild the SDK
npm run build

# Check TypeScript version
npx tsc --version
```

### Import Errors

If imports don't work:

```bash
# Make sure dependencies are installed
npm install

# Link the SDK locally (for development)
npm link
cd /path/to/your/app
npm link @dev.smartpricing/traceflow-sdk
```

## Additional Resources

- [Main README](../README.md) - Full API documentation
- [Service Integration Guide](../SERVICE_INTEGRATION.md) - Production deployment
- [Changelog](../CHANGELOG.md) - Version history
- [Summary](../SUMMARY.md) - Technical details

## Contributing

Found a bug or want to add an example? Please open an issue or submit a pull request!

## License

MIT

