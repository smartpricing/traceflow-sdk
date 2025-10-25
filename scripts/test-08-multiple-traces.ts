/**
 * Test Script 08: Multiple Concurrent Traces
 * Tests: Creating and managing multiple traces in parallel
 */

import { TraceFlowClient } from '../src';

async function test08MultiplTraces() {
  console.log('🧪 TEST 08: Multiple Concurrent Traces\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Create multiple traces
  console.log('→ Test 8.1: Create 3 concurrent traces');
  
  const trace1 = await client.trace({
    job_type: 'test_concurrent_1',
    title: 'Concurrent Trace 1',
    tags: ['concurrent', 'test'],
  });
  console.log(`  Trace 1 ID: ${trace1.getJobId()}`);

  const trace2 = await client.trace({
    job_type: 'test_concurrent_2',
    title: 'Concurrent Trace 2',
    tags: ['concurrent', 'test'],
  });
  console.log(`  Trace 2 ID: ${trace2.getJobId()}`);

  const trace3 = await client.trace({
    job_type: 'test_concurrent_3',
    title: 'Concurrent Trace 3',
    tags: ['concurrent', 'test'],
  });
  console.log(`  Trace 3 ID: ${trace3.getJobId()}\n`);

  // Start all traces
  await Promise.all([
    trace1.start(),
    trace2.start(),
    trace3.start(),
  ]);
  console.log('  ✓ All traces started\n');

  // Work on trace 1
  console.log('  Working on Trace 1...');
  const t1s1 = await trace1.step({ name: 'T1-Step1' });
  await t1s1.info('Trace 1 processing...');
  await t1s1.finish();
  console.log(`    Step ${t1s1.getStepNumber()} completed`);

  // Work on trace 2
  console.log('  Working on Trace 2...');
  const t2s1 = await trace2.step({ name: 'T2-Step1' });
  await t2s1.info('Trace 2 processing...');
  await t2s1.finish();
  console.log(`    Step ${t2s1.getStepNumber()} completed`);

  // Work on trace 3
  console.log('  Working on Trace 3...');
  const t3s1 = await trace3.step({ name: 'T3-Step1' });
  await t3s1.info('Trace 3 processing...');
  await t3s1.finish();
  console.log(`    Step ${t3s1.getStepNumber()} completed\n`);

  // More work interleaved
  const t1s2 = await trace1.step({ name: 'T1-Step2' });
  const t2s2 = await trace2.step({ name: 'T2-Step2' });
  const t3s2 = await trace3.step({ name: 'T3-Step2' });
  console.log('  Created step 2 for all traces\n');

  // Finish all
  await Promise.all([
    t1s2.finish(),
    t2s2.finish(),
    t3s2.finish(),
  ]);
  console.log('  ✓ All steps finished\n');

  await Promise.all([
    trace1.finish({ result: 'success' }),
    trace2.finish({ result: 'success' }),
    trace3.finish({ result: 'success' }),
  ]);
  console.log('  ✓ All traces finished\n');

  // Test 2: Sequential trace creation
  console.log('→ Test 8.2: Sequential trace creation and completion');
  
  for (let i = 1; i <= 3; i++) {
    const trace = await client.trace({
      job_type: `test_sequential_${i}`,
      title: `Sequential Trace ${i}`,
    });
    await trace.start();
    
    const step = await trace.step({ name: `Step 1` });
    await step.finish();
    
    await trace.finish();
    console.log(`  Trace ${i} completed (${trace.getJobId()})`);
  }
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test08MultiplTraces().catch(console.error);
}

export { test08MultiplTraces };

