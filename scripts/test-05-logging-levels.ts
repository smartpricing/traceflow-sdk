/**
 * Test Script 05: Logging Levels
 * Tests: Different log levels at trace and step level
 */

import { TraceFlowClient } from '../src';

async function test05Logging() {
  console.log('🧪 TEST 05: Logging Levels\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Step-level logging
  console.log('→ Test 5.1: Step-level logging');
  const trace1 = await client.trace({
    job_type: 'test_step_logging',
    title: 'Step Logging Test',
  });
  console.log(`  Trace ID: ${trace1.getId()}`);
  await trace1.start();

  const step1 = await trace1.step({ name: 'Logging Test Step' });
  console.log(`  Step ${step1.getStepNumber()} created`);

  await step1.debug('Debug message', { level: 'debug', data: 'test' });
  console.log('  ✓ DEBUG log sent');

  await step1.info('Info message', { level: 'info', status: 'processing' });
  console.log('  ✓ INFO log sent');

  await step1.warn('Warning message', { level: 'warn', warning_type: 'slow_response' });
  console.log('  ✓ WARN log sent');

  await step1.error('Error message', { level: 'error', error_code: 'TEST_001' });
  console.log('  ✓ ERROR log sent');

  await step1.finish();
  await trace1.finish();
  console.log('  ✓ Test passed\n');

  // Test 2: Trace-level logging
  console.log('→ Test 5.2: Trace-level logging');
  const trace2 = await client.trace({
    job_type: 'test_trace_logging',
    title: 'Trace Logging Test',
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  await trace2.debug('Trace debug', { phase: 'initialization' });
  console.log('  ✓ DEBUG log sent (trace-level)');

  await trace2.info('Trace started', { timestamp: new Date().toISOString() });
  console.log('  ✓ INFO log sent (trace-level)');

  await trace2.warn('Trace warning', { memory_usage: '80%' });
  console.log('  ✓ WARN log sent (trace-level)');

  await trace2.error('Trace error', { recoverable: true });
  console.log('  ✓ ERROR log sent (trace-level)');

  await trace2.finish();
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test05Logging().catch(console.error);
}

export { test05Logging };

