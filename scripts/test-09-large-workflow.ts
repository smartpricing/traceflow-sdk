/**
 * Test Script 09: Large Workflow
 * Tests: Traces with many steps (10+ steps)
 */

import { TraceFlowClient } from '../src';

async function test09LargeWorkflow() {
  console.log('🧪 TEST 09: Large Workflow (Many Steps)\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Workflow with 20 steps
  console.log('→ Test 9.1: Trace with 20 steps');
  const trace1 = await client.trace(
    {
      job_type: 'test_large_workflow',
      title: 'Large Workflow - 20 Steps',
      metadata: { step_count: '20' },
    },
    { autoCloseSteps: true } // Use auto-close to simplify
  );
  console.log(`  Trace ID: ${trace1.getId()}`);
  await trace1.start();

  for (let i = 1; i <= 20; i++) {
    const step = await trace1.step({
      name: `Step ${i}`,
      step_type: 'processing',
    });
    await step.info(`Processing step ${i}...`, { step: i, total: 20 });
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Every 5th step, explicitly finish it (others will auto-close)
    if (i % 5 === 0) {
      await step.finish({ checkpoint: i });
      console.log(`  Step ${step.getStepNumber()} completed (checkpoint)`);
    }
  }

  await trace1.finish({ 
    total_steps: 20,
    checkpoints: [5, 10, 15, 20],
  });
  console.log('  ✓ Workflow completed - 20 steps processed\n');

  // Test 2: Workflow with mixed operations
  console.log('→ Test 9.2: Trace with 15 steps + operations');
  const trace2 = await client.trace({
    job_type: 'test_mixed_operations',
    title: 'Mixed Operations Workflow',
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  const operations = [
    'initialize', 'validate', 'fetch', 'parse', 'transform',
    'filter', 'aggregate', 'enrich', 'deduplicate', 'sort',
    'format', 'validate_output', 'compress', 'upload', 'cleanup'
  ];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const step = await trace2.step({
      name: op,
      step_type: 'operation',
      metadata: { operation: op, index: i },
    });

    await step.info(`Executing ${op}...`);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Simulate occasional errors (but continue)
    if (i === 8) {
      await step.warn('Duplicates found, removing...', { duplicates: 5 });
    }
    
    await step.finish({ operation: op, status: 'completed' });
    
    if ((i + 1) % 5 === 0) {
      console.log(`  Progress: ${i + 1}/${operations.length} operations completed`);
    }
  }

  await trace2.finish({ 
    operations: operations.length,
    status: 'success',
  });
  console.log('  ✓ Mixed operations workflow completed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test09LargeWorkflow().catch(console.error);
}

export { test09LargeWorkflow };

