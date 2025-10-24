/**
 * Example: Manual step number management
 * Shows how to explicitly set step numbers when needed
 */

import { TraceFlowClient, JobStatus } from '../src';

async function manualStepNumbersExample() {
  const client = new TraceFlowClient(
    {
      brokers: ['localhost:9092'],
      topic: 'ota-jobs',
    },
    'manual-steps-service'
  );

  await client.connect();

  try {
    const job = await client.createJob({
      job_type: 'complex-workflow',
      title: 'Workflow with Manual Step Numbering',
      description: 'Example showing explicit step number control',
    });

    await job.updateJob({ status: JobStatus.RUNNING });

    // Explicitly set step numbers (useful for parallel processing or complex workflows)
    const step0 = await job.createStep({
      step_number: 0,
      name: 'Initialize',
      step_type: 'init',
    });
    await job.completeStep(step0);

    const step10 = await job.createStep({
      step_number: 10,
      name: 'Phase 1 - Branch A',
      step_type: 'process',
    });
    await job.completeStep(step10);

    const step11 = await job.createStep({
      step_number: 11,
      name: 'Phase 1 - Branch B',
      step_type: 'process',
    });
    await job.completeStep(step11);

    const step20 = await job.createStep({
      step_number: 20,
      name: 'Phase 2 - Merge Results',
      step_type: 'merge',
    });
    await job.completeStep(step20);

    const step30 = await job.createStep({
      step_number: 30,
      name: 'Finalize',
      step_type: 'finalize',
    });
    await job.completeStep(step30);

    await job.completeJob({ phases_completed: 3 });
    console.log('Job with manual step numbers completed');
  } finally {
    await client.disconnect();
  }
}

async function mixedStepNumbersExample() {
  const client = new TraceFlowClient(
    {
      brokers: ['localhost:9092'],
      topic: 'ota-jobs',
    },
    'mixed-steps-service'
  );

  await client.connect();

  try {
    const job = await client.createJob({
      job_type: 'mixed-workflow',
      title: 'Mixed Auto and Manual Step Numbers',
    });

    await job.updateJob({ status: JobStatus.RUNNING });

    // Auto-increment from 0
    const step1 = await job.createStep({
      name: 'Auto Step 1',
    });
    console.log(`Created step ${step1} (auto)`); // Will be 0

    // Auto-increment to 1
    const step2 = await job.createStep({
      name: 'Auto Step 2',
    });
    console.log(`Created step ${step2} (auto)`); // Will be 1

    // Manually set to 5
    const step3 = await job.createStep({
      step_number: 5,
      name: 'Manual Step 5',
    });
    console.log(`Created step ${step3} (manual)`); // Will be 5

    // Auto-increment will now be 6 (continues from highest known step number)
    const step4 = await job.createStep({
      name: 'Auto Step 4',
    });
    console.log(`Created step ${step4} (auto)`); // Will be 6

    await job.completeStep(step1);
    await job.completeStep(step2);
    await job.completeStep(step3);
    await job.completeStep(step4);

    await job.completeJob();
    console.log('Mixed step numbering completed');
  } finally {
    await client.disconnect();
  }
}

// Run examples
if (require.main === module) {
  console.log('=== Example 1: Manual Step Numbers ===');
  manualStepNumbersExample()
    .then(() => {
      console.log('\n=== Example 2: Mixed Auto/Manual Step Numbers ===');
      return mixedStepNumbersExample();
    })
    .catch(console.error);
}

