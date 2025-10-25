/**
 * Example: Resuming Existing Traces and Steps
 * 
 * Demonstrates:
 * - Getting an existing trace with getTrace()
 * - Getting an existing step with getStep()
 * - Resuming work from another process/service
 * - Updating traces and steps across multiple services
 */

import { initializeTraceFlow, getTraceFlow } from '../src';

// Simulated scenario: Multiple services working on the same trace

async function resumingTracesExample() {
  console.log('=== Example: Resuming Existing Traces and Steps ===\n');

  // ============================================
  // SERVICE 1: Initiates the trace
  // ============================================
  console.log('--- SERVICE 1: Order Processing Service ---\n');
  
  const client1 = initializeTraceFlow({
    brokers: ['localhost:9092'],
  }, 'order-service');
  
  await client1.connect();

  // Create initial trace
  const trace = await client1.trace({
    job_type: 'order_fulfillment',
    title: 'Order #12345 Fulfillment',
    owner: 'order-service',
    tags: ['order', 'fulfillment'],
    metadata: {
      order_id: '12345',
      customer_id: 'CUST-789',
    },
  });

  const traceId = trace.getId();
  console.log(`✓ Created trace: ${traceId}`);

  await trace.start();
  console.log('✓ Trace started\n');

  // Create first step
  const step0 = await trace.step({
    name: 'Validate Order',
    step_type: 'validation',
  });
  await step0.info('Validating order details...');
  await new Promise(resolve => setTimeout(resolve, 200));
  await step0.finish({ valid: true });
  console.log(`✓ Step ${step0.getStepNumber()} completed\n`);

  // Create second step but DON'T finish it
  const step1 = await trace.step({
    name: 'Reserve Inventory',
    step_type: 'reservation',
  });
  await step1.info('Reserving items in warehouse...');
  await new Promise(resolve => setTimeout(resolve, 200));
  // Step1 is now OPEN - we'll let another service finish it
  console.log(`→ Step ${step1.getStepNumber()} created (OPEN) - to be completed by warehouse service\n`);

  await client1.disconnect();

  // ============================================
  // SERVICE 2: Warehouse Service picks up the trace
  // ============================================
  console.log('--- SERVICE 2: Warehouse Service ---\n');
  
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate time passing

  const client2 = initializeTraceFlow({
    brokers: ['localhost:9092'],
  }, 'warehouse-service');
  
  await client2.connect();

  // Resume the existing trace using getTrace()
  console.log(`→ Resuming trace: ${traceId}`);
  const resumedTrace = client2.getTrace(traceId, 'warehouse-service');
  console.log('✓ Trace resumed\n');

  // Get the open step (step 1) and complete it
  console.log(`→ Getting existing step ${step1.getStepNumber()}`);
  const resumedStep1 = resumedTrace.getStep(step1.getStepNumber());
  console.log('✓ Step retrieved\n');

  await resumedStep1.info('Inventory reserved successfully', {
    reserved_items: 3,
    warehouse_id: 'WH-001',
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  await resumedStep1.finish({
    reserved: true,
    items: ['ITEM-1', 'ITEM-2', 'ITEM-3'],
  });
  console.log(`✓ Step ${resumedStep1.getStepNumber()} completed by warehouse service\n`);

  // Create next step
  const step2 = await resumedTrace.step({
    name: 'Pack Order',
    step_type: 'packing',
  });
  await step2.info('Packing items...');
  await new Promise(resolve => setTimeout(resolve, 300));
  // Leave step2 OPEN for shipping service
  console.log(`→ Step ${step2.getStepNumber()} created (OPEN) - to be completed by shipping service\n`);

  await client2.disconnect();

  // ============================================
  // SERVICE 3: Shipping Service
  // ============================================
  console.log('--- SERVICE 3: Shipping Service ---\n');
  
  await new Promise(resolve => setTimeout(resolve, 500));

  const client3 = initializeTraceFlow({
    brokers: ['localhost:9092'],
  }, 'shipping-service');
  
  await client3.connect();

  // Resume the trace again
  console.log(`→ Resuming trace: ${traceId}`);
  const shippingTrace = client3.getTrace(traceId, 'shipping-service');

  // Get and complete step 2
  const resumedStep2 = shippingTrace.getStep(step2.getStepNumber());
  await resumedStep2.info('Items packed, ready for shipping');
  await resumedStep2.finish({ package_id: 'PKG-456' });
  console.log(`✓ Step ${step2.getStepNumber()} completed by shipping service\n`);

  // Create final step
  const step3 = await shippingTrace.step({
    name: 'Ship Order',
    step_type: 'shipping',
  });
  await step3.info('Order shipped via Express Courier');
  await step3.finish({
    tracking_number: 'TRK-789456',
    carrier: 'Express Courier',
  });
  console.log(`✓ Step ${step3.getStepNumber()} completed\n`);

  // Complete the entire trace
  await shippingTrace.finish({
    success: true,
    order_status: 'shipped',
    tracking_number: 'TRK-789456',
  });
  console.log('✓ Trace completed by shipping service\n');

  await client3.disconnect();

  // ============================================
  // Summary
  // ============================================
  console.log('=== Summary ===\n');
  console.log('✓ Trace created by: order-service');
  console.log('✓ Step 0 completed by: order-service');
  console.log('✓ Step 1 completed by: warehouse-service (resumed)');
  console.log('✓ Step 2 completed by: shipping-service (resumed)');
  console.log('✓ Step 3 completed by: shipping-service');
  console.log('✓ Trace finished by: shipping-service\n');
  console.log('🎉 Multi-service workflow completed!\n');
}

if (require.main === module) {
  resumingTracesExample().catch(console.error);
}

export { resumingTracesExample };

