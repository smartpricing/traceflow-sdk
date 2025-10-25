/**
 * Test Script 07: Manual Step Numbers
 * Tests: Manual step numbering, auto-increment after manual numbers
 */

import { TraceFlowClient } from '../src';

async function test07ManualStepNumbers() {
  console.log('🧪 TEST 07: Manual Step Numbers\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Manual step numbers
  console.log('→ Test 7.1: Manual step numbering');
  const trace1 = await client.trace({
    job_type: 'test_manual_numbers',
    title: 'Manual Step Numbers Test',
  });
  console.log(`  Trace ID: ${trace1.getId()}`);
  await trace1.start();

  const step1 = await trace1.step({ 
    step_number: 10,
    name: 'Manual Step 10',
  });
  console.log(`  Created step with manual number: ${step1.getStepNumber()} (expected: 10)`);

  const step2 = await trace1.step({ 
    step_number: 20,
    name: 'Manual Step 20',
  });
  console.log(`  Created step with manual number: ${step2.getStepNumber()} (expected: 20)`);

  const step3 = await trace1.step({ 
    name: 'Auto Step (should be 21)',
  });
  console.log(`  Created auto step: ${step3.getStepNumber()} (expected: 21)`);

  const step4 = await trace1.step({ 
    name: 'Auto Step (should be 22)',
  });
  console.log(`  Created auto step: ${step4.getStepNumber()} (expected: 22)`);

  await trace1.finish();
  console.log('  ✓ Test passed\n');

  // Test 2: Mixed manual and auto numbering
  console.log('→ Test 7.2: Mixed manual and auto numbering');
  const trace2 = await client.trace({
    job_type: 'test_mixed_numbers',
    title: 'Mixed Step Numbers Test',
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  const s1 = await trace2.step({ name: 'Auto 0' });
  console.log(`  Auto step: ${s1.getStepNumber()}`);

  const s2 = await trace2.step({ name: 'Auto 1' });
  console.log(`  Auto step: ${s2.getStepNumber()}`);

  const s3 = await trace2.step({ step_number: 100, name: 'Manual 100' });
  console.log(`  Manual step: ${s3.getStepNumber()}`);

  const s4 = await trace2.step({ name: 'Auto 101' });
  console.log(`  Auto step: ${s4.getStepNumber()}`);

  const s5 = await trace2.step({ step_number: 50, name: 'Manual 50 (lower)' });
  console.log(`  Manual step (lower): ${s5.getStepNumber()}`);

  const s6 = await trace2.step({ name: 'Auto (should be 102)' });
  console.log(`  Auto step: ${s6.getStepNumber()}`);

  await trace2.finish();
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test07ManualStepNumbers().catch(console.error);
}

export { test07ManualStepNumbers };

