/**
 * Example 04: Step Logging
 * 
 * Demonstrates:
 * - Different log levels (INFO, WARN, ERROR, DEBUG)
 * - Logging at step level
 * - Logging at trace level
 * - Logging with details
 */

import { TraceFlowClient } from '../src';

async function stepLogging() {
  console.log('=== Example 04: Step Logging ===\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
    clientId: 'example-04',
  }, 'logging-service');

  await client.connect();
  console.log('✓ Connected to Kafka\n');

  const trace = await client.trace({
    job_type: 'data_validation',
    title: 'Data Validation with Logging',
  });

  await trace.start();
  console.log('✓ Trace started\n');

  // Trace-level logging
  await trace.info('Starting data validation process');
  console.log('✓ Trace-level INFO log\n');

  // Step 1: Validation with detailed logging
  const step1 = await trace.step({
    name: 'Validate Schema',
    step_type: 'validation',
  });
  console.log(`→ Step ${step1.getStepNumber()}: Validate Schema`);

  await step1.debug('Loading schema definition', { 
    schema_version: '1.2.0',
    fields: 12,
  });
  console.log('  • DEBUG log with details');

  await step1.info('Validating 100 records against schema');
  console.log('  • INFO log');

  await step1.warn('5 records have missing optional fields', {
    missing_fields: ['phone', 'address2'],
    affected_records: [23, 45, 67, 89, 90],
  });
  console.log('  • WARN log with details');

  await step1.finish({ 
    valid: 95,
    warnings: 5,
  });
  console.log('  ✓ Step completed\n');

  // Step 2: Data cleaning with error logging
  const step2 = await trace.step({
    name: 'Clean Data',
    step_type: 'transform',
  });
  console.log(`→ Step ${step2.getStepNumber()}: Clean Data`);

  await step2.info('Starting data cleaning...');
  console.log('  • INFO log');

  // Simulate an issue
  await step2.error('Failed to clean 2 records', {
    error_code: 'INVALID_FORMAT',
    records: [12, 34],
    reason: 'Date format incompatible',
  });
  console.log('  • ERROR log with details');

  await step2.info('Successfully cleaned 98 out of 100 records');
  console.log('  • INFO log');

  await step2.finish({ 
    cleaned: 98,
    failed: 2,
  });
  console.log('  ✓ Step completed\n');

  // Trace-level summary logging
  await trace.info('Data validation completed', {
    total_records: 100,
    valid: 95,
    cleaned: 98,
    warnings: 5,
    errors: 2,
  });
  console.log('✓ Trace-level summary log\n');

  await trace.finish({ 
    success: true,
    summary: 'Validation completed with warnings',
  });
  console.log('✓ Trace finished\n');

  await client.disconnect();
  console.log('✓ Disconnected from Kafka\n');
}

if (require.main === module) {
  stepLogging().catch(console.error);
}

export { stepLogging };

