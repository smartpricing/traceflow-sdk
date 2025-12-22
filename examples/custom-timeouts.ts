/**
 * Custom Timeouts Example
 * 
 * This example demonstrates how to use custom timeouts for traces and steps.
 * 
 * By default, the TraceFlow service uses global timeout settings, but you can
 * override them on a per-trace basis for special use cases.
 */

import { TraceFlowSDK } from '../src/sdk';

async function main() {
  // Initialize SDK
  const sdk = new TraceFlowSDK({
    transport: 'http',
    source: 'custom-timeouts-example',
    endpoint: 'http://localhost:3009',
    silentErrors: false,
  });

  console.log('\n=== Custom Timeouts Examples ===\n');

  // ============================================================================
  // Example 1: Quick Task (Short Timeout)
  // ============================================================================
  console.log('Example 1: Quick API Call with 5-second timeout\n');

  const quickTrace = await sdk.startTrace({
    trace_type: 'quick_task',
    title: 'Quick API Call',
    trace_timeout_ms: 5000, // 5 seconds total timeout
    step_timeout_ms: 2000,  // 2 seconds per step
  });

  try {
    const step1 = await quickTrace.startStep({
      name: 'Fetch user data',
      step_type: 'http_request',
    });

    // Simulate quick operation
    await new Promise((resolve) => setTimeout(resolve, 500));

    await step1.finish({ user: { id: 123 } });
    await quickTrace.finish({ success: true });

    console.log('✅ Quick trace completed within timeout\n');
  } catch (error) {
    console.error('❌ Quick trace failed:', error);
    await quickTrace.fail(error as Error);
  }

  // ============================================================================
  // Example 2: Long-Running Process (Extended Timeout)
  // ============================================================================
  console.log('Example 2: Data Export with 10-minute timeout\n');

  const longTrace = await sdk.startTrace({
    trace_type: 'batch_export',
    title: 'Export Large Dataset',
    trace_timeout_ms: 600000, // 10 minutes
    step_timeout_ms: 120000,  // 2 minutes per step
    metadata: {
      estimated_rows: 1000000,
    },
  });

  try {
    // Step 1: Query database
    const queryStep = await longTrace.startStep({
      name: 'Query Database',
      step_type: 'database',
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await queryStep.finish({ rows_fetched: 1000000 });

    // Step 2: Transform data
    const transformStep = await longTrace.startStep({
      name: 'Transform Data',
      step_type: 'processing',
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await transformStep.finish({ rows_transformed: 1000000 });

    // Step 3: Write to file
    const writeStep = await longTrace.startStep({
      name: 'Write to CSV',
      step_type: 'file_io',
    });

    await new Promise((resolve) => setTimeout(resolve, 800));
    await writeStep.finish({ file_size_mb: 250 });

    await longTrace.finish({
      total_rows: 1000000,
      file_path: '/exports/data_2024.csv',
    });

    console.log('✅ Long-running trace completed successfully\n');
  } catch (error) {
    console.error('❌ Long trace failed:', error);
    await longTrace.fail(error as Error);
  }

  // ============================================================================
  // Example 3: Real-Time Processing (Very Short Timeout)
  // ============================================================================
  console.log('Example 3: Real-time event processing with 1-second timeout\n');

  const realtimeTrace = await sdk.startTrace({
    trace_type: 'realtime_processing',
    title: 'Process WebSocket Event',
    trace_timeout_ms: 1000, // 1 second max
    step_timeout_ms: 300,   // 300ms per step
  });

  try {
    const validateStep = await realtimeTrace.startStep({
      name: 'Validate Event',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await validateStep.finish({ valid: true });

    const processStep = await realtimeTrace.startStep({
      name: 'Process Event',
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await processStep.finish({ processed: true });

    const notifyStep = await realtimeTrace.startStep({
      name: 'Notify Clients',
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await notifyStep.finish({ clients_notified: 5 });

    await realtimeTrace.finish({ latency_ms: 230 });

    console.log('✅ Real-time trace completed within 1 second\n');
  } catch (error) {
    console.error('❌ Real-time trace failed:', error);
    await realtimeTrace.fail(error as Error);
  }

  // ============================================================================
  // Example 4: ML Model Training (Very Long Timeout)
  // ============================================================================
  console.log('Example 4: ML Model Training with 2-hour timeout\n');

  const mlTrace = await sdk.startTrace({
    trace_type: 'ml_training',
    title: 'Train Neural Network',
    trace_timeout_ms: 7200000, // 2 hours
    step_timeout_ms: 1800000,  // 30 minutes per step
    metadata: {
      model_type: 'transformer',
      epochs: 100,
    },
  });

  try {
    const dataLoadStep = await mlTrace.startStep({
      name: 'Load Training Data',
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await dataLoadStep.finish({ samples: 100000 });

    const trainStep = await mlTrace.startStep({
      name: 'Train Model',
      metadata: { epochs: 100 },
    });

    // Simulate long training (in reality, this would take much longer)
    for (let epoch = 1; epoch <= 5; epoch++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await trainStep.log(`Epoch ${epoch}/100 - Loss: 0.${100 - epoch}`);

      // Send heartbeat every few epochs to keep trace alive
      if (epoch % 2 === 0) {
        await sdk.heartbeat(mlTrace.trace_id);
      }
    }

    await trainStep.finish({ final_loss: 0.05, accuracy: 0.98 });

    const saveStep = await mlTrace.startStep({
      name: 'Save Model',
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await saveStep.finish({ model_path: '/models/transformer_v1.pt' });

    await mlTrace.finish({
      training_time_seconds: 7200,
      final_accuracy: 0.98,
    });

    console.log('✅ ML training trace completed successfully\n');
  } catch (error) {
    console.error('❌ ML training trace failed:', error);
    await mlTrace.fail(error as Error);
  }

  // ============================================================================
  // Example 5: Using Default Timeouts (No Custom Timeout)
  // ============================================================================
  console.log('Example 5: Using service default timeouts\n');

  const defaultTrace = await sdk.startTrace({
    trace_type: 'standard_task',
    title: 'Standard Process',
    // No timeout specified - will use service defaults
  });

  try {
    const step = await defaultTrace.startStep({ name: 'Process Data' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await step.finish({ success: true });
    await defaultTrace.finish();

    console.log('✅ Default timeout trace completed\n');
  } catch (error) {
    console.error('❌ Default trace failed:', error);
    await defaultTrace.fail(error as Error);
  }

  // Flush and shutdown
  await sdk.flush();
  await sdk.shutdown();

  console.log('\n=== All examples completed ===\n');
}

// Run examples
main().catch(console.error);

/**
 * TIMEOUT GUIDELINES
 * 
 * 1. Quick API Calls: 5-30 seconds
 *    - Simple CRUD operations
 *    - External API calls
 *    - Cache lookups
 * 
 * 2. Background Jobs: 1-5 minutes
 *    - Email sending
 *    - File processing
 *    - Report generation
 * 
 * 3. Batch Processing: 10-60 minutes
 *    - Data imports/exports
 *    - Bulk operations
 *    - Database migrations
 * 
 * 4. Long-Running Tasks: 1-24 hours
 *    - ML training
 *    - Video processing
 *    - Large-scale analytics
 * 
 * 5. Default (No timeout specified):
 *    - Uses service-level configuration
 *    - Typically 30 minutes trace / 5 minutes step
 * 
 * BEST PRACTICES:
 * 
 * - Set realistic timeouts based on expected execution time
 * - Add 20-30% buffer for network delays and retries
 * - Use heartbeats for very long-running processes
 * - Monitor timeout events to tune your settings
 * - Different environments may need different timeouts
 */

