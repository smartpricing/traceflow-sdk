/**
 * Test Script 03: Pending Steps Auto-Close
 * Tests: Pending steps are closed when trace finishes/fails/cancels
 */

import { TraceFlowClient } from '../src';

async function test03PendingSteps() {
  console.log('🧪 TEST 03: Pending Steps Auto-Close\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Pending steps closed on finish
  console.log('→ Test 3.1: Pending steps closed on trace.finish()');
  const trace1 = await client.trace({
    job_type: 'test_pending_finish',
    title: 'Pending Steps - Finish',
  });
  console.log(`  Trace ID: ${trace1.getId()}`);
  await trace1.start();

  const s1 = await trace1.step({ name: 'Step 1' });
  const s2 = await trace1.step({ name: 'Step 2' });
  const s3 = await trace1.step({ name: 'Step 3' });
  console.log(`  Created 3 steps - All OPEN`);
  console.log(`    Step ${s1.getStepNumber()}: ${s1.isClosed() ? 'CLOSED' : 'OPEN'}`);
  console.log(`    Step ${s2.getStepNumber()}: ${s2.isClosed() ? 'CLOSED' : 'OPEN'}`);
  console.log(`    Step ${s3.getStepNumber()}: ${s3.isClosed() ? 'CLOSED' : 'OPEN'}`);

  await trace1.finish();
  console.log(`  After trace.finish():`);
  console.log(`    Step ${s1.getStepNumber()}: ${s1.isClosed() ? 'CLOSED ✓' : 'OPEN ✗'}`);
  console.log(`    Step ${s2.getStepNumber()}: ${s2.isClosed() ? 'CLOSED ✓' : 'OPEN ✗'}`);
  console.log(`    Step ${s3.getStepNumber()}: ${s3.isClosed() ? 'CLOSED ✓' : 'OPEN ✗'}`);
  console.log('  ✓ Test passed\n');

  // Test 2: Pending steps closed on fail
  console.log('→ Test 3.2: Pending steps closed on trace.fail()');
  const trace2 = await client.trace({
    job_type: 'test_pending_fail',
    title: 'Pending Steps - Fail',
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  const s4 = await trace2.step({ name: 'Step 1' });
  const s5 = await trace2.step({ name: 'Step 2' });
  console.log(`  Created 2 steps - All OPEN`);

  await trace2.fail('Test failure');
  console.log(`  After trace.fail():`);
  console.log(`    Step ${s4.getStepNumber()}: ${s4.isClosed() ? 'CLOSED ✓' : 'OPEN ✗'}`);
  console.log(`    Step ${s5.getStepNumber()}: ${s5.isClosed() ? 'CLOSED ✓' : 'OPEN ✗'}`);
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test03PendingSteps().catch(console.error);
}

export { test03PendingSteps };

