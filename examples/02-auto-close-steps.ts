/**
 * Example 02: Auto-Close Steps
 * 
 * Demonstrates:
 * - Using autoCloseSteps option
 * - Automatic step closing when creating new steps
 * - Automatic step closing when trace finishes
 */

import { TraceFlowClient } from '../src';

async function autoCloseSteps() {
  console.log('=== Example 02: Auto-Close Steps ===\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
    clientId: 'example-02',
  }, 'auto-close-service');

  await client.connect();
  console.log('✓ Connected to Kafka\n');

  // Enable autoCloseSteps option
  const trace = await client.trace(
    {
      job_type: 'etl_pipeline',
      title: 'ETL Pipeline with Auto-Close',
      description: 'Extract, Transform, Load pipeline',
    },
    { autoCloseSteps: true } // ← Enable auto-close
  );
  console.log(`✓ Created trace with autoCloseSteps enabled\n`);

  await trace.start();

  // Create step 1 - don't manually close it
  const step1 = await trace.step({
    name: 'Extract Data',
    step_type: 'extract',
  });
  console.log(`✓ Step ${step1.getStepNumber()}: Extract Data (OPEN)`);
  await step1.info('Extracting data from source...');
  await new Promise(resolve => setTimeout(resolve, 300));
  // Note: NOT calling step1.finish() here!

  // Create step 2 - this will auto-close step 1
  const step2 = await trace.step({
    name: 'Transform Data',
    step_type: 'transform',
  });
  console.log(`  → Step ${step1.getStepNumber()} auto-closed`);
  console.log(`✓ Step ${step2.getStepNumber()}: Transform Data (OPEN)`);
  await step2.info('Transforming data...');
  await new Promise(resolve => setTimeout(resolve, 300));
  // Note: NOT calling step2.finish() here!

  // Create step 3 - this will auto-close step 2
  const step3 = await trace.step({
    name: 'Load Data',
    step_type: 'load',
  });
  console.log(`  → Step ${step2.getStepNumber()} auto-closed`);
  console.log(`✓ Step ${step3.getStepNumber()}: Load Data (OPEN)`);
  await step3.info('Loading data to destination...');
  await new Promise(resolve => setTimeout(resolve, 300));
  // Note: NOT calling step3.finish() here!

  console.log('\n✓ All steps created, step 3 still OPEN');
  console.log(`  Steps state: step1=${step1.isClosed()}, step2=${step2.isClosed()}, step3=${step3.isClosed()}\n`);

  // Finish trace - this will auto-close ALL pending steps
  await trace.finish({ success: true });
  console.log('✓ Trace finished - ALL pending steps auto-closed\n');
  console.log(`  Final steps state: step1=${step1.isClosed()}, step2=${step2.isClosed()}, step3=${step3.isClosed()}\n`);

  await client.disconnect();
  console.log('✓ Disconnected from Kafka\n');
}

if (require.main === module) {
  autoCloseSteps().catch(console.error);
}

export { autoCloseSteps };

