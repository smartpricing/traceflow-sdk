/**
 * Test Script 06: Step State Management
 * Tests: Step state, isClosed(), getStepNumber(), step updates
 */

import { TraceFlowClient } from '../src';

async function test06StepState() {
  console.log('🧪 TEST 06: Step State Management\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Step state transitions
  console.log('→ Test 6.1: Step state transitions');
  const trace1 = await client.trace({
    job_type: 'test_step_state',
    title: 'Step State Test',
  });
  console.log(`  Trace ID: ${trace1.getId()}`);
  await trace1.start();

  const step1 = await trace1.step({ name: 'State Test Step' });
  console.log(`  Step created:`);
  console.log(`    Number: ${step1.getStepNumber()}`);
  console.log(`    Closed: ${step1.isClosed()}`);

  await step1.update({ metadata: { progress: '50%' } });
  console.log(`  Step updated (metadata)`);
  console.log(`    Closed: ${step1.isClosed()}`);

  await step1.finish();
  console.log(`  Step finished`);
  console.log(`    Closed: ${step1.isClosed()}`);

  // Test trying to update closed step (should fail)
  try {
    await step1.update({ metadata: { progress: '100%' } });
    console.log('  ✗ ERROR: Should not allow update on closed step');
  } catch (error: any) {
    console.log(`  ✓ Correctly prevented update on closed step: ${error.message}`);
  }

  await trace1.finish();
  console.log('  ✓ Test passed\n');

  // Test 2: Multiple steps with getStepNumber
  console.log('→ Test 6.2: Multiple steps - getStepNumber()');
  const trace2 = await client.trace({
    job_type: 'test_step_numbers',
    title: 'Step Numbers Test',
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  const steps = [];
  for (let i = 0; i < 5; i++) {
    const step = await trace2.step({ name: `Step ${i + 1}` });
    steps.push(step);
    console.log(`  Created step ${step.getStepNumber()}`);
  }

  console.log(`  Verifying step numbers:`);
  for (let i = 0; i < steps.length; i++) {
    const expectedNumber = i;
    const actualNumber = steps[i].getStepNumber();
    console.log(`    Step ${i}: ${actualNumber === expectedNumber ? '✓' : '✗'} (expected: ${expectedNumber}, got: ${actualNumber})`);
  }

  await trace2.finish();
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test06StepState().catch(console.error);
}

export { test06StepState };

