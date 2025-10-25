/**
 * Example: Integrated TraceJobCleaner with TraceFlowClient
 * 
 * This example shows how to use the cleaner integrated directly in the client configuration.
 * 
 * PATTERN:
 * - Main service (tracing): cleaner disabled
 * - Cron service (cleanup): cleaner enabled
 */

import { initializeTraceFlow, getTraceFlow } from 'traceflow-sdk';

// ============================================================================
// EXAMPLE 1: Main Service - Tracing Only (Cleaner Disabled)
// ============================================================================

async function example1_mainServiceTracing() {
  console.log('\n=== Example 1: Main Service - Tracing Only ===\n');

  // In your main service that does tracing, DON'T enable the cleaner
  const client = initializeTraceFlow({
    brokers: ['localhost:9092'],
    topic: 'traceflow',
    serviceUrl: 'http://localhost:3000', // For state recovery only
    // cleanerConfig: NOT specified - cleaner disabled
  }, 'main-service');

  await client.connect();

  console.log('✅ Main service initialized');
  console.log('📊 Cleaner status:', client.hasActiveCleaner() ? 'ENABLED' : 'DISABLED');

  // Use the client for tracing
  const trace = await client.trace({
    job_type: 'data-sync',
    title: 'Daily Data Sync',
  });

  await trace.start();
  
  const step = await trace.step({ name: 'Process data' });
  await step.finish();
  
  await trace.finish();

  console.log('✅ Trace completed successfully');
  
  await client.disconnect();
}

// ============================================================================
// EXAMPLE 2: Cron Service - Cleanup Only (Cleaner Enabled)
// ============================================================================

async function example2_cronServiceCleanup() {
  console.log('\n=== Example 2: Cron Service - Cleanup Only ===\n');

  // In your cron service, ENABLE the cleaner
  const client = initializeTraceFlow({
    brokers: ['localhost:9092'],
    topic: 'traceflow',
    serviceUrl: 'http://localhost:3000', // Required for cleaner
    cleanerConfig: {
      inactivityTimeoutSeconds: 1800,  // 30 minutes
      cleanupIntervalSeconds: 300,     // 5 minutes
      autoStart: true,                 // Start automatically on connect
      logger: (message, data) => {
        console.log(`[Cleaner] ${message}`, data || '');
      },
    },
  }, 'cron-cleaner-service');

  await client.connect();

  console.log('✅ Cron service initialized');
  console.log('📊 Cleaner status:', client.hasActiveCleaner() ? 'ENABLED ✓' : 'DISABLED');
  console.log('🔄 Cleaner will run automatically every 5 minutes');
  console.log('⏱️  Inactive traces (>30 min) will be closed');

  // The cleaner runs automatically in the background
  // Keep the service running
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down cron service...');
    await client.disconnect(); // This will stop the cleaner automatically
    process.exit(0);
  });

  // Simulate long-running cron job
  await new Promise(() => {}); // Keep alive
}

// ============================================================================
// EXAMPLE 3: Complete Setup - Both Services
// ============================================================================

async function example3_completeSetup() {
  console.log('\n=== Example 3: Complete Setup ===\n');
  console.log('This example shows how to configure both services:\n');

  console.log('📁 main-service/index.ts:');
  console.log(`
import { initializeTraceFlow } from 'traceflow-sdk';

const client = initializeTraceFlow({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000',
  // NO cleanerConfig - cleaner disabled
}, 'main-service');

await client.connect();

// Use for tracing...
const trace = await client.trace({ ... });
  `);

  console.log('\n📁 cron-service/index.ts:');
  console.log(`
import { initializeTraceFlow } from 'traceflow-sdk';

const client = initializeTraceFlow({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000', // Required
  cleanerConfig: {
    inactivityTimeoutSeconds: 1800,
    cleanupIntervalSeconds: 300,
    autoStart: true,
  },
}, 'cron-cleaner');

await client.connect(); // Cleaner starts automatically

// Keep running...
  `);

  console.log('\n✅ Both services configured correctly!');
}

// ============================================================================
// EXAMPLE 4: Manual Control (Advanced)
// ============================================================================

async function example4_manualControl() {
  console.log('\n=== Example 4: Manual Control ===\n');

  // Create with autoStart: false for manual control
  const client = initializeTraceFlow({
    brokers: ['localhost:9092'],
    serviceUrl: 'http://localhost:3000',
    cleanerConfig: {
      inactivityTimeoutSeconds: 1800,
      cleanupIntervalSeconds: 300,
      autoStart: false, // Don't start automatically
    },
  }, 'cron-service');

  await client.connect();

  console.log('📋 Cleaner created but not started');
  console.log('📊 Is active?', client.hasActiveCleaner());

  // Get cleaner instance for manual control
  const cleaner = client.getCleaner();
  
  if (cleaner) {
    // Start manually
    cleaner.start();
    console.log('✅ Cleaner started manually');
    console.log('📊 Is active?', client.hasActiveCleaner());

    // Trigger manual cleanup
    await cleaner.runCleanup();
    console.log('✅ Manual cleanup completed');

    // Stop it
    cleaner.stop();
    console.log('🛑 Cleaner stopped');
  }

  await client.disconnect();
}

// ============================================================================
// EXAMPLE 5: Environment-Based Configuration
// ============================================================================

async function example5_environmentBased() {
  console.log('\n=== Example 5: Environment-Based Configuration ===\n');

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

  await client.connect();

  console.log(`✅ Service initialized: ${isCronService ? 'CRON' : 'MAIN'}`);
  console.log('📊 Cleaner status:', client.hasActiveCleaner() ? 'ENABLED ✓' : 'DISABLED');

  if (isCronService) {
    console.log('🔄 Running as cleanup cron service');
    // Keep alive...
  } else {
    console.log('📝 Running as tracing service');
    // Do tracing work...
  }

  await client.disconnect();
}

// ============================================================================
// EXAMPLE 6: Docker Compose Setup
// ============================================================================

async function example6_dockerComposeSetup() {
  console.log('\n=== Example 6: Docker Compose Setup ===\n');
  console.log('Example docker-compose.yml:\n');
  
  console.log(`
version: '3.8'

services:
  # Main service - handles tracing
  main-service:
    build: ./main-service
    environment:
      - KAFKA_BROKERS=kafka:9092
      - TRACEFLOW_SERVICE_URL=http://traceflow-service:3000
      - SERVICE_TYPE=main  # Cleaner disabled
    depends_on:
      - kafka
      - traceflow-service

  # Cron service - handles cleanup
  cron-cleaner-service:
    build: ./cron-service
    environment:
      - KAFKA_BROKERS=kafka:9092
      - TRACEFLOW_SERVICE_URL=http://traceflow-service:3000
      - SERVICE_TYPE=cron  # Cleaner enabled
      - CLEANUP_TIMEOUT_SECONDS=1800
      - CLEANUP_INTERVAL_SECONDS=300
    depends_on:
      - kafka
      - traceflow-service
  `);

  console.log('\n✅ Separation of concerns achieved!');
  console.log('   - main-service: traces operations');
  console.log('   - cron-cleaner-service: cleans up inactive traces');
}

// ============================================================================
// Run Examples
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const exampleNum = args[0] || '3';

  switch (exampleNum) {
    case '1':
      example1_mainServiceTracing().catch(console.error);
      break;
    case '2':
      example2_cronServiceCleanup().catch(console.error);
      break;
    case '3':
      example3_completeSetup().catch(console.error);
      break;
    case '4':
      example4_manualControl().catch(console.error);
      break;
    case '5':
      example5_environmentBased().catch(console.error);
      break;
    case '6':
      example6_dockerComposeSetup().catch(console.error);
      break;
    default:
      console.log('Usage: ts-node 10-trace-cleaner.ts [1-6]');
      console.log('  1 - Main Service (tracing only)');
      console.log('  2 - Cron Service (cleanup only)');
      console.log('  3 - Complete Setup (both services)');
      console.log('  4 - Manual Control');
      console.log('  5 - Environment-Based Configuration');
      console.log('  6 - Docker Compose Setup');
  }
}

export {
  example1_mainServiceTracing,
  example2_cronServiceCleanup,
  example3_completeSetup,
  example4_manualControl,
  example5_environmentBased,
  example6_dockerComposeSetup,
};
