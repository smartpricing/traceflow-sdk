/**
 * Example: Using Kafka Transport
 * 
 * This example shows how to use the SDK with Kafka transport
 * to send events as Kafka messages.
 */

import { TraceFlowSDK, LogLevel } from '../src';

async function main() {
  // Initialize SDK with Kafka transport
  const sdk = new TraceFlowSDK({
    transport: 'kafka',
    source: 'example-service',
    
    kafka: {
      brokers: ['localhost:9092'],
      clientId: 'traceflow-example',
      topic: 'traceflow-events',
      
      // Optional: SASL authentication
      // sasl: {
      //   mechanism: 'plain',
      //   username: 'your-username',
      //   password: 'your-password',
      // },
      
      // Optional: SSL
      // ssl: true,
    },
    
    // Behavior
    autoFlushOnExit: true,
    silentErrors: true, // Don't throw on Kafka errors
  });

  console.log('🚀 TraceFlow SDK initialized with Kafka transport\n');

  // ========================================================================
  // Example 1: Basic trace with Kafka
  // ========================================================================
  console.log('📝 Example 1: Basic Kafka trace');

  await sdk.runWithTrace(
    {
      trace_type: 'api_request',
      title: 'Handle API Request',
      metadata: {
        endpoint: '/api/users',
        method: 'GET',
      },
    },
    async () => {
      // All events are sent to Kafka
      
      const step1 = await sdk.startStep({
        name: 'Authenticate',
        step_type: 'auth',
      });

      await step1.log('Validating JWT token');
      await step1.finish({ output: { user_id: 'user_123' } });

      const step2 = await sdk.startStep({
        name: 'Fetch Data',
        step_type: 'database',
      });

      await step2.log('Querying database');
      await step2.finish({ output: { records: 50 } });

      return { success: true };
    }
  );

  console.log('✅ Trace sent to Kafka\n');

  // ========================================================================
  // Example 2: High-throughput scenario
  // ========================================================================
  console.log('📝 Example 2: High-throughput scenario');

  // Process multiple items with tracing
  const items = Array.from({ length: 10 }, (_, i) => i + 1);

  for (const item of items) {
    await sdk.runWithTrace(
      {
        trace_type: 'item_processing',
        title: `Process Item ${item}`,
        metadata: { item_id: item },
      },
      async () => {
        const step = await sdk.startStep({
          name: 'Process',
          input: { item_id: item },
        });

        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 10));

        await step.finish({
          output: { processed: true },
        });
      }
    );
  }

  console.log('✅ 10 traces sent to Kafka\n');

  // ========================================================================
  // Example 3: Fire-and-forget pattern
  // ========================================================================
  console.log('📝 Example 3: Fire-and-forget (no await)');

  // Start traces without waiting (Kafka handles delivery)
  const trace1 = await sdk.startTrace({
    trace_type: 'background_job',
    title: 'Background Job 1',
  });

  const trace2 = await sdk.startTrace({
    trace_type: 'background_job',
    title: 'Background Job 2',
  });

  // Finish without waiting
  trace1.finish({ result: 'job1_complete' });
  trace2.finish({ result: 'job2_complete' });

  console.log('✅ Traces sent (fire-and-forget)\n');

  // ========================================================================
  // Example 4: Ordering guarantees
  // ========================================================================
  console.log('📝 Example 4: Kafka ordering guarantees');

  const trace = await sdk.startTrace({
    trace_type: 'ordered_process',
    title: 'Process with Ordering',
  });

  console.log(`📌 Trace ID (partition key): ${trace.trace_id}`);
  console.log('   All events for this trace go to same partition → ordered delivery');

  // These events are guaranteed to arrive in order
  await trace.log('Event 1');
  await trace.log('Event 2');
  await trace.log('Event 3');

  const step = await trace.startStep({ name: 'Step 1' });
  await step.finish();

  await trace.finish();

  console.log('✅ All events sent in order\n');

  // ========================================================================
  // Cleanup
  // ========================================================================
  console.log('🧹 Flushing and shutting down...');
  await sdk.flush(); // Wait for all pending Kafka messages
  await sdk.shutdown();
  console.log('✅ SDK shutdown complete');
}

// Run example
main().catch(console.error);

