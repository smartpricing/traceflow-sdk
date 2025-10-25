/**
 * Example 01: Basic Usage
 * 
 * Demonstrates:
 * - Creating a trace
 * - Starting and finishing a trace
 * - Creating steps manually
 * - Manual step closing
 */

import { TraceFlowClient } from '../src';

async function basicUsage() {
  console.log('=== Example 01: Basic Usage ===\n');

  // 1. Initialize client
  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
    clientId: 'example-01',
    // topic: 'traceflow', // Optional - defaults to 'traceflow'
  }, 'basic-service');

  await client.connect();
  console.log('✓ Connected to Kafka\n');

  // 2. Create a trace
  const trace = await client.trace({
    job_type: 'data_sync',
    title: 'Basic Data Sync',
    description: 'Synchronize user data from external API',
    tags: ['sync', 'users'],
  });
  console.log(`✓ Created trace: ${trace.getJobId()}\n`);

  // 3. Start the trace
  await trace.start();
  console.log('✓ Trace started\n');

  // 4. Create steps
  const step1 = await trace.step({
    name: 'Fetch Users',
    step_type: 'fetch',
  });
  console.log(`✓ Step ${step1.getStepNumber()}: Fetch Users`);

  await step1.info('Fetching users from API...');
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 500));
  await step1.finish({ users_fetched: 100 });
  console.log(`  ✓ Step ${step1.getStepNumber()} completed\n`);

  const step2 = await trace.step({
    name: 'Transform Data',
    step_type: 'transform',
  });
  console.log(`✓ Step ${step2.getStepNumber()}: Transform Data`);

  await step2.info('Transforming user data...');
  await new Promise(resolve => setTimeout(resolve, 300));
  await step2.finish({ users_transformed: 100 });
  console.log(`  ✓ Step ${step2.getStepNumber()} completed\n`);

  const step3 = await trace.step({
    name: 'Save to Database',
    step_type: 'save',
  });
  console.log(`✓ Step ${step3.getStepNumber()}: Save to Database`);

  await step3.info('Saving users to database...');
  await new Promise(resolve => setTimeout(resolve, 400));
  await step3.finish({ users_saved: 100 });
  console.log(`  ✓ Step ${step3.getStepNumber()} completed\n`);

  // 5. Finish the trace
  await trace.finish({
    success: true,
    total_users: 100,
    duration_ms: 1200,
  });
  console.log('✓ Trace finished successfully\n');

  // 6. Disconnect
  await client.disconnect();
  console.log('✓ Disconnected from Kafka\n');
}

// Run the example
if (require.main === module) {
  basicUsage().catch(console.error);
}

export { basicUsage };

