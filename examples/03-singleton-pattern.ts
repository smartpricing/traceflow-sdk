/**
 * Example 03: Singleton Pattern
 * 
 * Demonstrates:
 * - Initializing client once with singleton pattern
 * - Using client from different functions
 * - Multiple traces from same client instance
 */

import { initializeTraceFlow, getTraceFlow } from '../src';

async function singletonPattern() {
  console.log('=== Example 03: Singleton Pattern ===\n');

  // 1. Initialize once (typically in your main.ts or app.ts)
  console.log('→ Initializing TraceFlow singleton...');
  const client = initializeTraceFlow(
    {
      brokers: ['localhost:9092'],
      clientId: 'example-03',
    },
    'singleton-service'
  );
  await client.connect();
  console.log('✓ Singleton initialized and connected\n');

  // 2. Use from different functions without passing client around
  await processUsers();
  await processOrders();

  // 3. Disconnect when app shuts down
  await client.disconnect();
  console.log('\n✓ Disconnected from Kafka\n');
}

async function processUsers() {
  console.log('→ Processing users...');
  // Get the singleton instance
  const client = getTraceFlow();

  const trace = await client.trace({
    job_type: 'user_processing',
    title: 'Process Users',
  });

  await trace.start();
  const step = await trace.step({ name: 'Validate Users' });
  await step.info('Validating 50 users...');
  await new Promise(resolve => setTimeout(resolve, 200));
  await step.finish({ validated: 50 });
  await trace.finish({ success: true });
  
  console.log(`✓ Users processed (trace: ${trace.getJobId()})\n`);
}

async function processOrders() {
  console.log('→ Processing orders...');
  // Get the same singleton instance
  const client = getTraceFlow();

  const trace = await client.trace({
    job_type: 'order_processing',
    title: 'Process Orders',
  });

  await trace.start();
  const step = await trace.step({ name: 'Validate Orders' });
  await step.info('Validating 25 orders...');
  await new Promise(resolve => setTimeout(resolve, 200));
  await step.finish({ validated: 25 });
  await trace.finish({ success: true });
  
  console.log(`✓ Orders processed (trace: ${trace.getJobId()})\n`);
}

if (require.main === module) {
  singletonPattern().catch(console.error);
}

export { singletonPattern };

