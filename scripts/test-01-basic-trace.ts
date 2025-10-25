/**
 * Test Script 01: Basic Trace Flow
 * Tests: Basic trace creation, steps, and completion
 */

import { TraceFlowClient } from '../src';

async function test01BasicTrace() {
  console.log('🧪 TEST 01: Basic Trace Flow\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Simple trace with manual step closing
  console.log('→ Test 1.1: Simple trace with 3 steps');
  const trace1 = await client.trace({
    job_type: 'test_basic',
    title: 'Basic Trace Test',
    owner: 'test-runner',
    tags: ['test', 'basic'],
  });
  console.log(`  Trace ID: ${trace1.getId()}`);

  await trace1.start();
  console.log('  Status: RUNNING');

  const step1 = await trace1.step({ name: 'Step 1', step_type: 'test' });
  console.log(`  Created step ${step1.getStepNumber()}: ${!step1.isClosed() ? 'OPEN' : 'CLOSED'}`);
  await step1.finish({ result: 'ok' });
  console.log(`  Step ${step1.getStepNumber()} finished: ${step1.isClosed() ? 'CLOSED' : 'OPEN'}`);

  const step2 = await trace1.step({ name: 'Step 2', step_type: 'test' });
  console.log(`  Created step ${step2.getStepNumber()}: ${!step2.isClosed() ? 'OPEN' : 'CLOSED'}`);
  await step2.finish({ result: 'ok' });
  console.log(`  Step ${step2.getStepNumber()} finished: ${step2.isClosed() ? 'CLOSED' : 'OPEN'}`);

  const step3 = await trace1.step({ name: 'Step 3', step_type: 'test' });
  console.log(`  Created step ${step3.getStepNumber()}: ${!step3.isClosed() ? 'OPEN' : 'CLOSED'}`);
  await step3.finish({ result: 'ok' });
  console.log(`  Step ${step3.getStepNumber()} finished: ${step3.isClosed() ? 'CLOSED' : 'OPEN'}`);

  await trace1.finish({ test: 'passed', steps: 3 });
  console.log('  Trace finished: SUCCESS\n');

  await client.disconnect();
  console.log('✓ Test completed\n');
}

if (require.main === module) {
  test01BasicTrace().catch(console.error);
}

export { test01BasicTrace };

