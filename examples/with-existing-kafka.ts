/**
 * Example: Using TraceFlow SDK with an existing Kafka instance
 * Useful when you already have a Kafka connection in your application
 */

import { Kafka } from 'kafkajs';
import { TraceFlowClient, JobStatus } from '../src';

async function exampleWithExistingKafka() {
  // Your existing Kafka instance (e.g., used by other parts of your app)
  const kafka = new Kafka({
    clientId: 'my-existing-app',
    brokers: ['localhost:9092'],
  });

  const producer = kafka.producer();
  await producer.connect();

  // Create TraceFlow client using the existing producer
  const traceFlow = new TraceFlowClient(
    {
      topic: 'ota-jobs',
      producer: producer, // Reuse existing producer
    },
    'my-service'
  );

  // No need to call connect() - client will use the already connected producer
  // await traceFlow.connect(); // This would be a no-op

  try {
    // Create and manage a job
    const job = await traceFlow.createJob({
      job_type: 'import',
      title: 'Import Properties',
      description: 'Importing property data from external source',
    });

    console.log(`Job created: ${job.getJobId()}`);

    await job.updateJob({ status: JobStatus.RUNNING });

    // Create steps without specifying step_number (auto-increment)
    const step1 = await job.createStep({
      name: 'Download CSV',
      step_type: 'download',
    });

    await job.info('Downloading CSV file...', undefined, step1);
    await job.completeStep(step1, { file_size: '5MB', rows: 1000 });

    const step2 = await job.createStep({
      name: 'Parse CSV',
      step_type: 'parse',
    });

    await job.info('Parsing CSV data...', undefined, step2);
    await job.completeStep(step2, { parsed_rows: 1000 });

    const step3 = await job.createStep({
      name: 'Import to Database',
      step_type: 'import',
    });

    await job.info('Importing to database...', undefined, step3);
    await job.completeStep(step3, { imported: 1000 });

    await job.completeJob({ total_imported: 1000 });

    console.log('Job completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect TraceFlow (won't disconnect the producer since we don't own it)
    await traceFlow.disconnect();

    // You manage the producer lifecycle
    await producer.disconnect();
  }
}

async function exampleWithKafkaInstance() {
  // You can also pass the Kafka instance and let TraceFlow create its own producer
  const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['localhost:9092'],
  });

  const traceFlow = new TraceFlowClient(
    {
      topic: 'ota-jobs',
      kafka: kafka, // Pass the Kafka instance
    },
    'my-service'
  );

  // Now you need to call connect()
  await traceFlow.connect();

  try {
    const job = await traceFlow.createJob({
      job_type: 'sync',
      title: 'Quick Sync',
    });

    await job.updateJob({ status: JobStatus.RUNNING });

    const step = await job.createStep({ name: 'Process Data' });
    await job.completeStep(step, { processed: 100 });

    await job.completeJob({ success: true });

    console.log('Job completed!');
  } finally {
    await traceFlow.disconnect();
  }
}

// Run examples
if (require.main === module) {
  console.log('=== Example 1: Using existing Producer ===');
  exampleWithExistingKafka()
    .then(() => {
      console.log('\n=== Example 2: Using existing Kafka instance ===');
      return exampleWithKafkaInstance();
    })
    .catch(console.error);
}

