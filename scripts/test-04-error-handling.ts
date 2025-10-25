/**
 * Test Script 04: Error Handling
 * Tests: Step failures, trace failures, error logging
 */

import { TraceFlowClient } from '../src';

async function test04ErrorHandling() {
  console.log('🧪 TEST 04: Error Handling\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Failed step, successful trace
  console.log('→ Test 4.1: Failed step, continue trace');
  const trace1 = await client.trace({
    job_type: 'test_step_failure',
    title: 'Step Failure Test',
  });
  console.log(`  Trace ID: ${trace1.getId()}`);
  await trace1.start();

  const step1 = await trace1.step({ name: 'Successful Step' });
  await step1.info('Processing...');
  await step1.finish({ result: 'success' });
  console.log(`  Step ${step1.getStepNumber()}: SUCCESS`);

  const step2 = await trace1.step({ name: 'Failed Step' });
  await step2.error('Something went wrong', { error_code: 'TEST_ERROR' });
  await step2.fail('Test error message');
  console.log(`  Step ${step2.getStepNumber()}: FAILED`);

  const step3 = await trace1.step({ name: 'Recovery Step' });
  await step3.info('Recovering from error...');
  await step3.finish({ result: 'recovered' });
  console.log(`  Step ${step3.getStepNumber()}: SUCCESS (recovery)`);

  await trace1.finish({ result: 'partial_success' });
  console.log('  Trace: FINISHED (with failed step)\n');

  // Test 2: Failed trace
  console.log('→ Test 4.2: Failed trace');
  const trace2 = await client.trace({
    job_type: 'test_trace_failure',
    title: 'Trace Failure Test',
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  const step4 = await trace2.step({ name: 'Step 1' });
  await step4.info('Starting...');
  
  const step5 = await trace2.step({ name: 'Step 2' });
  // Don't close these steps

  console.log(`  Step ${step4.getStepNumber()}: OPEN`);
  console.log(`  Step ${step5.getStepNumber()}: OPEN`);

  await trace2.error('Critical error occurred', { severity: 'high' });
  await trace2.fail('Test critical failure');
  console.log(`  Trace: FAILED`);
  console.log(`  Step ${step4.getStepNumber()}: ${step4.isClosed() ? 'AUTO-CLOSED' : 'OPEN'}`);
  console.log(`  Step ${step5.getStepNumber()}: ${step5.isClosed() ? 'AUTO-CLOSED' : 'OPEN'}`);
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test04ErrorHandling().catch(console.error);
}

export { test04ErrorHandling };

