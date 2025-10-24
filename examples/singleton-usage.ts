/**
 * Example: Using TraceFlow SDK with Singleton Pattern
 * This is the recommended approach for most applications
 */

import { initializeTraceFlow, getTraceFlow } from '../src';

async function singletonExample() {
  // Initialize once at application startup
  const client = initializeTraceFlow(
    {
      brokers: ['localhost:9092'],
      topic: 'ota-jobs',
      clientId: 'my-app',
    },
    'my-service' // default source
  );

  await client.connect();
  console.log('TraceFlow initialized and connected');

  // Now you can trace from anywhere in your application
  await traceOperation1();
  await traceOperation2();
  await traceOperation3();

  // Disconnect at application shutdown
  await client.disconnect();
  console.log('TraceFlow disconnected');
}

async function traceOperation1() {
  // Get the singleton instance
  const client = getTraceFlow();

  // Start a trace
  const trace = await client.trace({
    job_type: 'operation1',
    title: 'First Operation',
  });

  await trace.start();

  const step1 = await trace.step({ name: 'Process Data' });
  await trace.info('Processing operation 1...', undefined, step1);
  await trace.finishStep(step1, { processed: 100 });

  await trace.finish({ success: true });
  console.log('Operation 1 traced');
}

async function traceOperation2() {
  // Get the singleton instance again
  const client = getTraceFlow();

  // Start another trace - using the same client
  const trace = await client.trace({
    job_type: 'operation2',
    title: 'Second Operation',
  });

  await trace.start();

  const step1 = await trace.step({ name: 'Fetch Data' });
  await trace.finishStep(step1, { fetched: 50 });

  const step2 = await trace.step({ name: 'Transform Data' });
  await trace.finishStep(step2, { transformed: 50 });

  await trace.finish({ success: true });
  console.log('Operation 2 traced');
}

async function traceOperation3() {
  // Get the singleton instance
  const client = getTraceFlow();

  // Yet another trace
  const trace = await client.trace({
    job_type: 'operation3',
    title: 'Third Operation',
  });

  await trace.start();

  const step1 = await trace.step({ name: 'Save Results' });
  await trace.finishStep(step1, { saved: 150 });

  await trace.finish({ success: true });
  console.log('Operation 3 traced');
}

// Simulate application lifecycle
async function main() {
  try {
    await singletonExample();
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

// Example: Using in different modules
export async function someBusinessLogic() {
  const client = getTraceFlow();
  
  const trace = await client.trace({
    job_type: 'business_operation',
    title: 'Business Logic Execution',
  });
  
  await trace.start();
  
  try {
    // Your business logic here
    const step1 = await trace.step({ name: 'Validate Input' });
    await trace.finishStep(step1, { valid: true });
    
    const step2 = await trace.step({ name: 'Execute Logic' });
    await trace.finishStep(step2, { result: 'success' });
    
    await trace.finish({ success: true });
  } catch (error: any) {
    await trace.fail(error.message);
  }
}

