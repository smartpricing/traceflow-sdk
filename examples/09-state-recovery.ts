/**
 * Example: Using TraceFlow SDK with Service for State Recovery
 * 
 * Demonstrates:
 * - Configuring SDK with traceflow-service URL
 * - Resuming traces after pod restart
 * - Recovering step numbers from service
 * - Checking step state from persistent storage
 */

import { TraceFlowClient } from '../src';

async function stateRecoveryExample() {
  console.log('=== Example: State Recovery with TraceFlow Service ===\n');

  // ============================================
  // Scenario 1: Initial trace creation
  // ============================================
  console.log('--- Scenario 1: Creating trace with service enabled ---\n');

  const client1 = new TraceFlowClient({
    brokers: ['localhost:9092'],
    serviceUrl: 'http://localhost:3000/api', // ← URL of your traceflow-service
  }, 'pod-1');

  await client1.connect();

  const trace = await client1.trace({
    job_type: 'data_processing',
    title: 'Data Processing Job',
  });

  console.log(`✓ Created trace: ${trace.getId()}`);
  await trace.start();

  const step1 = await trace.step({ name: 'Extract' });
  await step1.info('Extracting data...');
  await step1.finish();
  console.log(`✓ Step ${step1.getStepNumber()} completed`);

  const step2 = await trace.step({ name: 'Transform' });
  await step2.info('Transforming data...');
  // Don't close step2 - simulate pod crash here
  console.log(`→ Step ${step2.getStepNumber()} OPEN (pod about to restart...)\n`);

  await client1.disconnect();

  // ============================================
  // Scenario 2: POD RESTART - Resume from service
  // ============================================
  console.log('--- Scenario 2: POD RESTARTED - Resuming from service ---\n');

  // Simulate pod restart - new client instance
  const client2 = new TraceFlowClient({
    brokers: ['localhost:9092'],
    serviceUrl: 'http://localhost:3000/api', // Same service URL
  }, 'pod-2'); // Different pod

  await client2.connect();

  // Resume the existing trace
  console.log(`→ Resuming trace: ${trace.getId()}`);
  const resumedTrace = client2.getTrace(trace.getId());

  // Initialize step numbering from service
  await resumedTrace.initializeFromService();
  console.log('✓ Step numbering recovered from service');

  // Check if service client is available
  if (client2.hasServiceClient()) {
    console.log('✓ Service client is configured\n');

    // Get service client to query state
    const serviceClient = client2.getServiceClient()!;

    // Check trace state
    const traceState = await serviceClient.getTrace(trace.getId());
    console.log('Trace state from service:');
    console.log(`  Status: ${traceState?.status}`);
    console.log(`  Last activity: ${traceState?.last_activity_at}\n`);

    // Check existing steps
    const steps = await serviceClient.getSteps(trace.getId());
    console.log(`Steps found in service: ${steps.length}`);
    steps.forEach(s => {
      console.log(`  Step ${s.step_number}: ${s.name} - ${s.status}`);
    });
    console.log('');

    // Get the open step (step 2)
    const openStep = resumedTrace.getStep(step2.getStepNumber());
    
    // Check if it's closed using service
    const isClosed = await openStep.isClosedFromService();
    console.log(`Step ${step2.getStepNumber()} closed: ${isClosed}\n`);

    // Complete the open step
    await openStep.info('Resuming transformation after restart...');
    await openStep.finish();
    console.log(`✓ Step ${step2.getStepNumber()} completed after restart\n`);
  }

  // Add new step (will continue from last step number)
  const step3 = await resumedTrace.step({ name: 'Load' });
  await step3.info('Loading data...');
  await step3.finish();
  console.log(`✓ Step ${step3.getStepNumber()} completed\n`);

  await resumedTrace.finish({ success: true });
  console.log('✓ Trace completed after pod restart\n');

  await client2.disconnect();

  // ============================================
  // Summary
  // ============================================
  console.log('=== Summary ===\n');
  console.log('✓ Trace created in pod-1');
  console.log('✗ Pod-1 crashed with open step');
  console.log('✓ Pod-2 resumed trace from service');
  console.log('✓ Step numbering recovered');
  console.log('✓ Open steps completed');
  console.log('✓ Trace finished successfully\n');
  console.log('🎉 State recovery successful!\n');
}

if (require.main === module) {
  stateRecoveryExample().catch(console.error);
}

export { stateRecoveryExample };

