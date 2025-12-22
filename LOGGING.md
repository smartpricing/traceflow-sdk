# TraceFlow SDK - Logging & Debugging Guide

## 📝 Overview

The TraceFlow SDK includes a comprehensive logging system to help you debug and monitor your tracing operations. The logging system is:

- **Configurable**: Control what gets logged and where
- **Level-based**: Filter logs by severity (debug, info, warn, error)
- **Customizable**: Integrate with your existing logging infrastructure
- **Production-safe**: Disable or minimize logs in production

## 🎯 Quick Start

### Default Logging

By default, the SDK logs at `INFO` level:

```typescript
import { TraceFlowSDK } from '@dev.smartpricing/traceflow-sdk';

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  // enableLogging: true (default)
  // logLevel: 'info' (default)
});

// You'll see logs like:
// [TraceFlow:INFO] Initializing TraceFlow SDK { transport: 'http', source: 'my-service', ... }
// [TraceFlow:INFO] Getting trace: abc-123
// [TraceFlow:INFO] Retrieved trace abc-123 { status: 'RUNNING' }
```

## 🔧 Configuration Options

### Log Levels

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

- **`debug`**: Detailed diagnostic information
  - Internal state changes
  - Context updates
  - Detailed event processing
  - Use in development

- **`info`** (default): General operational messages
  - Trace/step started
  - Trace/step completed
  - Transport initialization
  - Use in staging

- **`warn`**: Warning messages
  - Potential issues
  - Fallback behavior
  - Non-fatal errors
  - Use in production (recommended)

- **`error`**: Error messages
  - Failed operations
  - Network errors
  - Invalid configuration

### Enable/Disable Logging

```typescript
const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  enableLogging: false, // Disable all logs
});
```

### Set Log Level

```typescript
const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  enableLogging: true,
  logLevel: 'debug', // Show all logs including debug
});
```

## 🔌 Custom Logger Integration

### Basic Custom Logger

```typescript
const customLogger = {
  debug: (message: string, ...args: any[]) => {
    console.log(`[CUSTOM:DEBUG] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.log(`[CUSTOM:INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[CUSTOM:WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[CUSTOM:ERROR] ${message}`, ...args);
  },
};

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  logger: customLogger,
});
```

### Winston Integration

```typescript
import winston from 'winston';

const winstonLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'traceflow.log' }),
  ],
});

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  logger: {
    debug: (msg, ...args) => winstonLogger.debug(msg, ...args),
    info: (msg, ...args) => winstonLogger.info(msg, ...args),
    warn: (msg, ...args) => winstonLogger.warn(msg, ...args),
    error: (msg, ...args) => winstonLogger.error(msg, ...args),
  },
});
```

### Pino Integration

```typescript
import pino from 'pino';

const pinoLogger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  logger: {
    debug: (msg, ...args) => pinoLogger.debug({ args }, msg),
    info: (msg, ...args) => pinoLogger.info({ args }, msg),
    warn: (msg, ...args) => pinoLogger.warn({ args }, msg),
    error: (msg, ...args) => pinoLogger.error({ args }, msg),
  },
});
```

### Datadog Integration

```typescript
import { datadogLogs } from '@datadog/browser-logs';

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  logger: {
    debug: (msg, ...args) => datadogLogs.logger.debug(msg, { args }),
    info: (msg, ...args) => datadogLogs.logger.info(msg, { args }),
    warn: (msg, ...args) => datadogLogs.logger.warn(msg, { args }),
    error: (msg, ...args) => datadogLogs.logger.error(msg, { args }),
  },
});
```

## 📊 What Gets Logged

### Trace Operations

```typescript
// [TraceFlow:INFO] Starting trace: { title: 'My Process', trace_type: 'api_request' }
const trace = await sdk.startTrace({ title: 'My Process', trace_type: 'api_request' });

// [TraceFlow:INFO] Getting trace: abc-123
// [TraceFlow:DEBUG] Fetching trace state from service: abc-123
// [TraceFlow:INFO] Retrieved trace abc-123 { status: 'RUNNING' }
const existingTrace = await sdk.getTrace('abc-123');

// [TraceFlow:DEBUG] Found active trace in context: abc-123
const currentTrace = sdk.getCurrentTrace();

// [TraceFlow:INFO] Finishing trace: abc-123
await trace.finish({ result: 'success' });
```

### Step Operations

```typescript
// [TraceFlow:INFO] Starting step in trace abc-123: { name: 'Process Data' }
const step = await trace.startStep({ name: 'Process Data' });

// [TraceFlow:INFO] Finishing step: step-456 in trace abc-123
await step.finish({ output: 'done' });

// [TraceFlow:ERROR] Step already closed: step-456
await step.finish(); // Trying to finish twice
```

### Transport Operations

```typescript
// [TraceFlow:INFO] HTTP transport initialized: http://localhost:3009
// [TraceFlow:DEBUG] Sending event: trace_started for trace abc-123
// [TraceFlow:DEBUG] Event sent successfully

// [TraceFlow:WARN] Retry attempt 1/3 for event trace_finished
// [TraceFlow:ERROR] Failed to send event after 3 retries
```

## 🎭 Environment-Specific Configuration

```typescript
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: process.env.TRACEFLOW_ENDPOINT,
  
  // Development: See everything
  // Production: Only warnings and errors
  enableLogging: true,
  logLevel: isDevelopment ? 'debug' : 'warn',
  
  // Production: Never throw exceptions
  silentErrors: isProduction,
});
```

## 🔍 Debugging Tips

### Enable Debug Logging

When troubleshooting issues, enable debug logging:

```typescript
const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'my-service',
  endpoint: 'http://localhost:3009',
  logLevel: 'debug', // See everything
});
```

### Standalone Logger

Use the Logger class directly for debugging:

```typescript
import { Logger } from '@dev.smartpricing/traceflow-sdk';

const logger = new Logger({
  enabled: true,
  minLevel: 'debug',
});

logger.debug('Trace ID:', traceId);
logger.info('Processing started');
logger.warn('Slow operation detected');
logger.error('Operation failed', error);

// Scoped logger with prefix
const myLogger = logger.scope('[MyModule]');
myLogger.info('Module initialized');
```

## 📦 Logging in Different Contexts

### Express/Fastify Middleware

```typescript
app.use(async (req, res, next) => {
  const trace = await sdk.startTrace({
    title: `${req.method} ${req.path}`,
    trace_type: 'http_request',
    metadata: {
      request_id: req.id,
      user_id: req.user?.id,
    },
  });
  
  // Logs: [TraceFlow:INFO] Starting trace: { title: 'GET /api/users', ... }
  
  req.trace = trace;
  next();
});
```

### Background Jobs

```typescript
async function processJob(jobId: string) {
  const trace = await sdk.startTrace({
    title: `Job ${jobId}`,
    trace_type: 'background_job',
  });
  
  // Logs: [TraceFlow:INFO] Starting trace: { title: 'Job job-123', ... }
  
  try {
    // Process job...
    await trace.finish({ success: true });
    // Logs: [TraceFlow:INFO] Finishing trace: trace-abc-123
  } catch (error) {
    await trace.fail(error);
    // Logs: [TraceFlow:ERROR] Trace failed: trace-abc-123 { error: '...' }
  }
}
```

## 📖 Examples

See [`examples/logging-example.ts`](./examples/logging-example.ts) for complete working examples.

## 🏭 Production Best Practices

1. **Use `warn` level in production**
   ```typescript
   logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
   ```

2. **Always enable `silentErrors` in production**
   ```typescript
   silentErrors: process.env.NODE_ENV === 'production'
   ```

3. **Integrate with centralized logging**
   - Use Winston, Pino, or Bunyan for structured logging
   - Send logs to Datadog, New Relic, or CloudWatch

4. **Monitor error logs**
   - Set up alerts for `ERROR` level logs
   - Track retry failures
   - Monitor transport errors

5. **Disable logging for high-throughput services**
   ```typescript
   enableLogging: process.env.ENABLE_TRACEFLOW_LOGS === 'true'
   ```

## 🛠️ Current Implementation Status

✅ **Implemented:**
- Logger class with level-based filtering
- Configuration options (enableLogging, logLevel, logger)
- Custom logger integration
- Scoped logger support
- Basic logging in SDK constructor
- Logging in `getTrace()` and `getCurrentTrace()`

🚧 **In Progress:**
- Complete logging coverage in all SDK methods
- Logging in TraceHandle and StepHandle
- Logging in HTTP and Kafka transports
- Structured logging with context data

📝 **Planned:**
- Performance metrics logging
- Sampling for high-volume scenarios
- Log rotation and archiving guidance

---

Built with ❤️ by Smartpricing

