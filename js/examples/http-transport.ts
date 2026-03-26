/**
 * Example: Using HTTP Transport
 * 
 * This example shows how to use the SDK with HTTP transport
 * to send events to the TraceFlow REST API.
 */

import { TraceFlowSDK, LogLevel } from '../src';

async function main() {
  // Initialize SDK with HTTP transport
  const sdk = new TraceFlowSDK({
    transport: 'http',
    source: 'example-service',
    endpoint: 'http://localhost:3009',
    apiKey: 'your-api-key', // Optional
    
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000,
    enableCircuitBreaker: true,
    
    // Behavior
    autoFlushOnExit: true,
    silentErrors: false, // Throw on errors (useful for dev)
  });

  console.log('🚀 TraceFlow SDK initialized with HTTP transport\n');

  // ========================================================================
  // Example 1: Simple trace with manual control
  // ========================================================================
  console.log('📝 Example 1: Manual trace control');
  
  const trace1 = await sdk.startTrace({
    trace_type: 'order_processing',
    title: 'Process Order #12345',
    metadata: {
      customer_id: 'cust_123',
      priority: 'high',
    },
  });

  console.log(`✅ Trace started: ${trace1.trace_id}`);

  // Start a step
  const step1 = await trace1.startStep({
    name: 'Validate Order',
    step_type: 'validation',
    input: { order_id: 12345 },
  });

  // Log during step
  await step1.log('Validating customer credentials', { level: LogLevel.INFO });
  await step1.log('Checking inventory', { level: LogLevel.INFO });

  // Finish step
  await step1.finish({
    output: { valid: true },
  });

  console.log(`✅ Step finished: ${step1.step_id}`);

  // Another step
  const step2 = await trace1.startStep({
    name: 'Process Payment',
    step_type: 'payment',
  });

  await step2.log('Charging credit card', { level: LogLevel.INFO });
  await step2.finish({
    output: { transaction_id: 'txn_789' },
  });

  // Finish trace
  await trace1.finish({
    result: { status: 'success', order_id: 12345 },
  });

  console.log(`✅ Trace finished: ${trace1.trace_id}\n`);

  // ========================================================================
  // Example 2: Using runWithTrace (automatic context management)
  // ========================================================================
  console.log('📝 Example 2: Automatic context management');

  await sdk.runWithTrace(
    {
      trace_type: 'data_sync',
      title: 'Sync User Data',
    },
    async () => {
      console.log('✅ Inside trace context');

      // Start step (uses current trace context automatically)
      const step = await sdk.startStep({
        name: 'Fetch Data',
        step_type: 'api_call',
      });

      await step.log('Fetching user data from API');

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));

      await step.finish({
        output: { records: 100 },
      });

      // Log at trace level
      await sdk.log('Data sync completed successfully');

      return { synced: 100 };
    }
  );

  console.log('✅ Trace auto-completed\n');

  // ========================================================================
  // Example 3: Error handling
  // ========================================================================
  console.log('📝 Example 3: Error handling');

  const trace3 = await sdk.startTrace({
    trace_type: 'failing_process',
    title: 'Process That Fails',
  });

  const step3 = await trace3.startStep({
    name: 'Risky Operation',
  });

  try {
    // Simulate error
    throw new Error('Something went wrong!');
  } catch (error: any) {
    // Fail step
    await step3.fail(error);
    console.log(`❌ Step failed: ${step3.step_id}`);

    // Fail trace
    await trace3.fail(error);
    console.log(`❌ Trace failed: ${trace3.trace_id}\n`);
  }

  // ========================================================================
  // Example 4: Nested traces
  // ========================================================================
  console.log('📝 Example 4: Nested traces');

  const parentTrace = await sdk.startTrace({
    trace_type: 'parent_process',
    title: 'Parent Process',
  });

  console.log(`✅ Parent trace: ${parentTrace.trace_id}`);

  // Child trace
  const childTrace = await sdk.startTrace({
    trace_type: 'child_process',
    title: 'Child Process',
    parent_trace_id: parentTrace.trace_id,
  });

  console.log(`✅ Child trace: ${childTrace.trace_id}`);

  await childTrace.finish();
  await parentTrace.finish();

  console.log('✅ Nested traces completed\n');

  // ========================================================================
  // Cleanup
  // ========================================================================
  console.log('🧹 Flushing and shutting down...');
  await sdk.flush();
  await sdk.shutdown();
  console.log('✅ SDK shutdown complete');
}

// Run example
main().catch(console.error);

