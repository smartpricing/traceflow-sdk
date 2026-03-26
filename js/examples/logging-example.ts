/**
 * Logging Configuration Example
 * 
 * This example demonstrates the SDK's logging capabilities and configuration options.
 */

import { TraceFlowSDK, Logger } from '../src';

// ============================================================================
// Example 1: Default Logging (INFO level)
// ============================================================================

console.log('\n=== Example 1: Default Logging ===\n');

const sdk1 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  // enableLogging: true (default)
  // logLevel: 'info' (default)
});

// You'll see INFO, WARN, and ERROR logs
const trace1 = await sdk1.startTrace({ title: 'Example 1 - Default Logging' });
await trace1.log('This will show in logs');
await trace1.finish();

// ============================================================================
// Example 2: Debug Logging (See everything)
// ============================================================================

console.log('\n=== Example 2: Debug Logging ===\n');

const sdk2 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  enableLogging: true,
  logLevel: 'debug', // Show all logs including DEBUG
});

// You'll see DEBUG, INFO, WARN, and ERROR logs
const trace2 = await sdk2.startTrace({ title: 'Example 2 - Debug Mode' });
const step = await trace2.startStep({ name: 'Processing' });
await step.finish({ output: 'done' });
await trace2.finish();

// ============================================================================
// Example 3: Warnings and Errors Only
// ============================================================================

console.log('\n=== Example 3: Warnings and Errors Only ===\n');

const sdk3 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  enableLogging: true,
  logLevel: 'warn', // Only WARN and ERROR
});

// You'll only see WARN and ERROR logs (INFO and DEBUG are hidden)
const trace3 = await sdk3.startTrace({ title: 'Example 3 - Quiet Mode' });
await trace3.finish();

// ============================================================================
// Example 4: Disabled Logging
// ============================================================================

console.log('\n=== Example 4: Disabled Logging ===\n');

const sdk4 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  enableLogging: false, // No logs at all
});

// No logs will be shown
const trace4 = await sdk4.startTrace({ title: 'Example 4 - Silent' });
await trace4.finish();

// ============================================================================
// Example 5: Custom Logger (Winston, Pino, etc.)
// ============================================================================

console.log('\n=== Example 5: Custom Logger ===\n');

// Custom logger implementation (e.g., Winston, Pino, or your own)
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

const sdk5 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  enableLogging: true,
  logLevel: 'debug',
  logger: customLogger, // Use custom logger
});

const trace5 = await sdk5.startTrace({ title: 'Example 5 - Custom Logger' });
await trace5.finish();

// ============================================================================
// Example 6: Winston Integration
// ============================================================================

console.log('\n=== Example 6: Winston Integration ===\n');

// Example with Winston (install: npm install winston)
/*
import winston from 'winston';

const winstonLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    new winston.transports.File({ filename: 'traceflow.log' }),
  ],
});

const sdk6 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  enableLogging: true,
  logger: {
    debug: (msg, ...args) => winstonLogger.debug(msg, ...args),
    info: (msg, ...args) => winstonLogger.info(msg, ...args),
    warn: (msg, ...args) => winstonLogger.warn(msg, ...args),
    error: (msg, ...args) => winstonLogger.error(msg, ...args),
  },
});
*/

// ============================================================================
// Example 7: Pino Integration
// ============================================================================

console.log('\n=== Example 7: Pino Integration ===\n');

// Example with Pino (install: npm install pino)
/*
import pino from 'pino';

const pinoLogger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

const sdk7 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  enableLogging: true,
  logger: {
    debug: (msg, ...args) => pinoLogger.debug({ args }, msg),
    info: (msg, ...args) => pinoLogger.info({ args }, msg),
    warn: (msg, ...args) => pinoLogger.warn({ args }, msg),
    error: (msg, ...args) => pinoLogger.error({ args }, msg),
  },
});
*/

// ============================================================================
// Example 8: Log Level in Production
// ============================================================================

console.log('\n=== Example 8: Production Configuration ===\n');

const isProduction = process.env.NODE_ENV === 'production';

const sdk8 = new TraceFlowSDK({
  transport: 'http',
  source: 'logging-example',
  endpoint: 'http://localhost:3009',
  enableLogging: true,
  // In production: only warnings and errors
  // In development: show everything
  logLevel: isProduction ? 'warn' : 'debug',
  silentErrors: isProduction, // Never throw in production
});

const trace8 = await sdk8.startTrace({ title: 'Example 8 - Environment-Based' });
await trace8.finish();

// ============================================================================
// Example 9: Standalone Logger
// ============================================================================

console.log('\n=== Example 9: Standalone Logger ===\n');

// You can also use the Logger class directly
const standaloneLogger = new Logger({
  enabled: true,
  minLevel: 'debug',
});

standaloneLogger.debug('This is a debug message');
standaloneLogger.info('This is an info message');
standaloneLogger.warn('This is a warning message');
standaloneLogger.error('This is an error message');

// Scoped logger with prefix
const scopedLogger = standaloneLogger.scope('[MyModule]');
scopedLogger.info('Processing request');
scopedLogger.warn('Slow response detected');

console.log('\n=== All logging examples completed ===\n');

/**
 * LOG LEVELS EXPLAINED
 * 
 * - DEBUG: Detailed diagnostic information (use in development)
 *   - Trace/step creation details
 *   - Context updates
 *   - Internal state changes
 * 
 * - INFO: General informational messages (default)
 *   - Trace started/completed
 *   - Step started/completed
 *   - Transport initialization
 * 
 * - WARN: Warning messages (potential issues)
 *   - Transport fallback
 *   - Missing optional configuration
 *   - Non-fatal errors
 * 
 * - ERROR: Error messages (failures)
 *   - Failed to send events
 *   - Network errors
 *   - Invalid configuration
 * 
 * BEST PRACTICES:
 * 
 * 1. Development: Use 'debug' to see everything
 * 2. Staging: Use 'info' for normal operation
 * 3. Production: Use 'warn' to reduce noise
 * 4. Always set silentErrors: true in production
 * 5. Use custom logger for centralized logging (Winston, Pino, Datadog, etc.)
 */

