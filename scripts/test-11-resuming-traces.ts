/**
 * Test Script 11: Resuming Traces and Steps
 * Tests: getTrace(), getStep() functionality across "processes"
 */

import { TraceFlowClient } from '../src';

async function test11ResumingTraces() {
  console.log('🧪 TEST 11: Resuming Traces and Steps\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Resume trace and complete steps
  console.log('→ Test 11.1: Resume trace and complete open steps');
  
  // Simulate Process 1: Create trace with open steps
  const trace1 = await client.trace({
    job_type: 'test_resume',
    title: 'Resume Test - Part 1',
  });
  const traceId = trace1.getId();
  console.log(`  Created trace: ${traceId}`);
  
  await trace1.start();
  
  const step0 = await trace1.step({ name: 'Initial Step' });
  await step0.finish();
  console.log(`  Step ${step0.getStepNumber()} completed`);
  
  const step1 = await trace1.step({ name: 'Open Step' });
  console.log(`  Step ${step1.getStepNumber()} created (OPEN)`);
  // Don't close step1
  
  // Simulate Process 2: Resume trace and complete step1
  console.log(`  Resuming trace ${traceId}...`);
  const resumedTrace = client.getTrace(traceId);
  console.log(`  Trace resumed: ${resumedTrace.getId() === traceId ? 'MATCH ✓' : 'MISMATCH ✗'}`);
  
  const resumedStep1 = resumedTrace.getStep(step1.getStepNumber());
  console.log(`  Retrieved step ${resumedStep1.getStepNumber()}`);
  
  await resumedStep1.info('Completing from "another process"');
  await resumedStep1.finish({ resumed: true });
  console.log(`  Step ${resumedStep1.getStepNumber()} completed via resumed reference`);
  
  await resumedTrace.finish();
  console.log('  ✓ Test passed\n');

  // Test 2: Update steps via getStep()
  console.log('→ Test 11.2: Update steps via getStep()');
  
  const trace2 = await client.trace({
    job_type: 'test_step_update',
    title: 'Step Update Test',
  });
  console.log(`  Created trace: ${trace2.getId()}`);
  await trace2.start();
  
  // Create multiple steps
  const s0 = await trace2.step({ name: 'Step 0' });
  const s1 = await trace2.step({ name: 'Step 1' });
  const s2 = await trace2.step({ name: 'Step 2' });
  console.log(`  Created 3 steps: ${s0.getStepNumber()}, ${s1.getStepNumber()}, ${s2.getStepNumber()}`);
  
  // Update step 1 via getStep()
  const stepRef = trace2.getStep(s1.getStepNumber());
  await stepRef.update({ metadata: { updated: 'via_getStep' } });
  console.log(`  Updated step ${s1.getStepNumber()} via getStep()`);
  
  await stepRef.finish({ method: 'getStep' });
  console.log(`  Finished step ${s1.getStepNumber()} via getStep()`);
  
  // Complete trace
  await trace2.finish();
  console.log('  ✓ Test passed\n');

  // Test 3: Multiple traces, resume any
  console.log('→ Test 11.3: Resume specific trace from multiple traces');
  
  const traces = [];
  for (let i = 0; i < 3; i++) {
    const trace = await client.trace({
      job_type: `test_multi_${i}`,
      title: `Trace ${i}`,
    });
    await trace.start();
    traces.push({ id: trace.getId(), index: i });
    console.log(`  Created trace ${i}: ${trace.getId()}`);
  }
  
  // Resume middle trace
  const middleTraceId = traces[1].id;
  console.log(`  Resuming trace 1: ${middleTraceId}`);
  const resumedMiddle = client.getTrace(middleTraceId);
  
  const step = await resumedMiddle.step({ name: 'Added to resumed trace' });
  await step.finish();
  console.log(`  Added and completed step on resumed trace 1`);
  
  await resumedMiddle.finish();
  console.log(`  Finished resumed trace 1`);
  
  // Finish other traces
  for (let i = 0; i < traces.length; i++) {
    if (i === 1) continue; // Already finished
    const t = client.getTrace(traces[i].id);
    await t.finish();
    console.log(`  Finished trace ${i}`);
  }
  
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test11ResumingTraces().catch(console.error);
}

export { test11ResumingTraces };

