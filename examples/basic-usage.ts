/**
 * Basic usage example of TraceFlow SDK
 */

import { TraceFlowClient } from '../src';

async function basicExample() {
  // Create client with configuration
  const client = new TraceFlowClient(
    {
      brokers: ['localhost:9092'],
      topic: 'ota-jobs',
      clientId: 'my-app',
    },
    'my-service' // default source
  );

  // Connect to Kafka
  await client.connect();

  try {
    // Start a new trace
    const trace = await client.trace({
      job_type: 'sync',
      title: 'Sync Airbnb Data',
      description: 'Synchronizing booking data from Airbnb',
      owner: 'sync-service',
      tags: ['airbnb', 'sync', 'booking'],
      metadata: {
        property_id: '12345',
        connection_id: 'conn-abc',
      },
      params: {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      },
    });

    console.log(`Trace created: ${trace.getJobId()}`);

    // Start the trace (sets status to running)
    await trace.start();

    // Add first step (step_number will be auto-incremented from 0)
    const step1 = await trace.step({
      name: 'Fetch Data from Airbnb',
      step_type: 'fetch',
      input: { endpoint: '/api/bookings' },
    });
    console.log(`Step ${step1} started`);

    // Add a log to the step
    await trace.info('Connecting to Airbnb API...', { attempt: 1 }, step1);

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Finish the step
    await trace.finishStep(step1, {
      bookings_count: 150,
      last_sync: new Date().toISOString(),
    });

    // Add second step (will be auto-incremented to 1)
    const step2 = await trace.step({
      name: 'Transform Data',
      step_type: 'transform',
    });

    await trace.info('Transforming booking data...', undefined, step2);

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 500));

    await trace.finishStep(step2, {
      transformed_records: 150,
    });

    // Add third step (will be auto-incremented to 2)
    const step3 = await trace.step({
      name: 'Save to Database',
      step_type: 'save',
    });

    await trace.info('Saving to database...', undefined, step3);

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 800));

    await trace.finishStep(step3, {
      saved_records: 150,
    });

    // Finish the trace successfully
    await trace.finish({
      total_bookings: 150,
      sync_duration_ms: 2300,
      success: true,
    });

    console.log('Trace completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect
    await client.disconnect();
  }
}

// Run the example
if (require.main === module) {
  basicExample().catch(console.error);
}

