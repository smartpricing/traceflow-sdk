/**
 * Basic usage example of TraceFlow SDK
 */

import { TraceFlowClient, JobStatus, StepStatus } from '../src';

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
    // Create a new job
    const job = await client.createJob({
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

    console.log(`Job created: ${job.getJobId()}`);

    // Update job status to running
    await job.updateJob({ status: JobStatus.RUNNING });

    // Create first step (step_number will be auto-incremented from 0)
    const step1 = await job.createStep({
      name: 'Fetch Data from Airbnb',
      step_type: 'fetch',
      input: { endpoint: '/api/bookings' },
    });
    console.log(`Step ${step1} started`);

    // Add a log to the step
    await job.info('Connecting to Airbnb API...', { attempt: 1 }, step1);

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Complete the step
    await job.completeStep(step1, {
      bookings_count: 150,
      last_sync: new Date().toISOString(),
    });

    // Create second step (will be auto-incremented to 1)
    const step2 = await job.createStep({
      name: 'Transform Data',
      step_type: 'transform',
    });

    await job.info('Transforming booking data...', undefined, step2);

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 500));

    await job.completeStep(step2, {
      transformed_records: 150,
    });

    // Create third step (will be auto-incremented to 2)
    const step3 = await job.createStep({
      name: 'Save to Database',
      step_type: 'save',
    });

    await job.info('Saving to database...', undefined, step3);

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 800));

    await job.completeStep(step3, {
      saved_records: 150,
    });

    // Complete the job successfully
    await job.completeJob({
      total_bookings: 150,
      sync_duration_ms: 2300,
      success: true,
    });

    console.log('Job completed successfully!');
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

