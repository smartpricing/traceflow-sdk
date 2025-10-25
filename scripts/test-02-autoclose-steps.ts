/**
 * Test Script 02: Auto-Close Steps
 * Tests: autoCloseSteps option functionality
 */

import { TraceFlowClient } from '../src';

async function test02AutoClose() {
  console.log('🧪 TEST 02: Auto-Close Steps\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: autoCloseSteps enabled
  console.log('→ Test 2.1: Auto-close enabled');
  const trace1 = await client.trace(
    {
      job_type: 'test_autoclose',
      title: 'Auto-Close Test - Enabled',
    },
    { autoCloseSteps: true }
  );
  console.log(`  Trace ID: ${trace1.getId()}`);
  await trace1.start();

  const step1 = await trace1.step({ name: 'Step 1' });
  console.log(`  Step ${step1.getStepNumber()} created: ${step1.isClosed() ? 'CLOSED' : 'OPEN'}`);

  const step2 = await trace1.step({ name: 'Step 2' });
  console.log(`  Step ${step2.getStepNumber()} created: ${step2.isClosed() ? 'CLOSED' : 'OPEN'}`);
  console.log(`  Step ${step1.getStepNumber()} auto-closed: ${step1.isClosed() ? 'YES' : 'NO'}`);

  const step3 = await trace1.step({ name: 'Step 3' });
  console.log(`  Step ${step3.getStepNumber()} created: ${step3.isClosed() ? 'CLOSED' : 'OPEN'}`);
  console.log(`  Step ${step2.getStepNumber()} auto-closed: ${step2.isClosed() ? 'YES' : 'NO'}`);

  await trace1.finish();
  console.log(`  Step ${step3.getStepNumber()} auto-closed on finish: ${step3.isClosed() ? 'YES' : 'NO'}`);
  console.log('  ✓ Test passed\n');

  // Test 2: autoCloseSteps disabled (default)
  console.log('→ Test 2.2: Auto-close disabled (default)');
  const trace2 = await client.trace({
    job_type: 'test_no_autoclose',
    title: 'Auto-Close Test - Disabled',
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  const step4 = await trace2.step({ name: 'Step 1' });
  console.log(`  Step ${step4.getStepNumber()} created: ${step4.isClosed() ? 'CLOSED' : 'OPEN'}`);

  const step5 = await trace2.step({ name: 'Step 2' });
  console.log(`  Step ${step5.getStepNumber()} created: ${step5.isClosed() ? 'CLOSED' : 'OPEN'}`);
  console.log(`  Step ${step4.getStepNumber()} still open: ${!step4.isClosed() ? 'YES' : 'NO'}`);

  await trace2.finish();
  console.log(`  Step ${step4.getStepNumber()} auto-closed on finish: ${step4.isClosed() ? 'YES' : 'NO'}`);
  console.log(`  Step ${step5.getStepNumber()} auto-closed on finish: ${step5.isClosed() ? 'YES' : 'NO'}`);
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test02AutoClose().catch(console.error);
}

export { test02AutoClose };

