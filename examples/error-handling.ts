/**
 * Example: Error handling and job failure scenarios
 */

import { TraceFlowClient, JobStatus, StepStatus, LogLevel } from '../src';

async function errorHandlingExample() {
  const client = new TraceFlowClient(
    {
      brokers: ['localhost:9092'],
      topic: 'ota-jobs',
    },
    'error-demo-service'
  );

  await client.connect();

  try {
    // Create a job that will encounter errors
    const job = await client.createJob({
      job_type: 'export',
      title: 'Export Data with Errors',
      description: 'Demonstrating error handling',
    });

    await job.updateJob({ status: JobStatus.RUNNING });

    // Step 1: Success
    const step1 = await job.createStep({
      name: 'Validate Input',
      step_type: 'validation',
    });

    await job.info('Validating input parameters...', undefined, step1);
    await job.completeStep(step1, { valid: true });

    // Step 2: Warning
    const step2 = await job.createStep({
      name: 'Fetch Data',
      step_type: 'fetch',
    });

    await job.warn('Slow response from API', { response_time_ms: 3500 }, step2);

    // Simulate partial success
    await job.completeStep(step2, {
      records_fetched: 80,
      records_expected: 100,
      warnings: ['Some records were missing'],
    });

    // Step 3: Failure
    const step3 = await job.createStep({
      name: 'Process Data',
      step_type: 'processing',
    });

    try {
      await job.info('Processing data...', undefined, step3);

      // Simulate an error
      throw new Error('Network timeout during processing');
    } catch (error: any) {
      // Log the error
      await job.error(error.message, { stack: error.stack }, step3);

      // Mark step as failed
      await job.failStep(step3, `Processing failed: ${error.message}`);

      // Fail the entire job
      await job.failJob(`Job failed at step ${step3}: ${error.message}`);

      console.log('Job failed as expected');
      return;
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  } finally {
    await client.disconnect();
  }
}

async function retryExample() {
  const client = new TraceFlowClient(
    {
      brokers: ['localhost:9092'],
      topic: 'ota-jobs',
    },
    'retry-demo-service'
  );

  await client.connect();

  try {
    const job = await client.createJob({
      job_type: 'sync',
      title: 'Sync with Retry Logic',
      metadata: { max_retries: '3' },
    });

    await job.updateJob({ status: JobStatus.RUNNING });

    const step = await job.createStep({
      name: 'Fetch External API',
      step_type: 'fetch',
    });

    // Simulate retries
    let attempt = 0;
    const maxRetries = 3;

    for (attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await job.info(`Attempt ${attempt} of ${maxRetries}`, { attempt }, step);

        // Simulate API call that might fail
        if (attempt < maxRetries) {
          throw new Error('Connection timeout');
        }

        // Success on last attempt
        await job.info('Successfully connected!', { attempt }, step);
        await job.completeStep(step, {
          success: true,
          attempts: attempt,
        });
        break;
      } catch (error: any) {
        await job.warn(`Attempt ${attempt} failed: ${error.message}`, { attempt, error: error.message }, step);

        if (attempt === maxRetries) {
          await job.error('All retry attempts exhausted', { total_attempts: attempt }, step);
          await job.failStep(step, 'Failed after maximum retries');
          await job.failJob('Sync failed after all retry attempts');
          console.log('Job failed after retries');
          return;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await job.debug(`Waiting ${delay}ms before retry...`, { delay_ms: delay }, step);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    await job.completeJob({ success: true, total_attempts: attempt });
    console.log('Job completed successfully after retries');
  } finally {
    await client.disconnect();
  }
}

// Run examples
if (require.main === module) {
  console.log('=== Example 1: Error Handling ===');
  errorHandlingExample()
    .then(() => {
      console.log('\n=== Example 2: Retry Logic ===');
      return retryExample();
    })
    .catch(console.error);
}

