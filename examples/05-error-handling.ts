/**
 * Example 05: Error Handling
 * 
 * Demonstrates:
 * - Failing individual steps
 * - Failing entire trace
 * - Try-catch with step error handling
 * - Auto-close on trace failure
 */

import { TraceFlowClient } from '../src';

async function errorHandling() {
  console.log('=== Example 05: Error Handling ===\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
    clientId: 'example-05',
  }, 'error-service');

  await client.connect();
  console.log('✓ Connected to Kafka\n');

  // Example 1: Step failure without stopping trace
  console.log('→ Example 5a: Step failure (continue trace)\n');
  const trace1 = await client.trace({
    job_type: 'data_import',
    title: 'Data Import with Step Failure',
  });

  await trace1.start();

  const step1 = await trace1.step({ name: 'Download File' });
  await step1.info('Downloading file from S3...');
  await step1.finish({ file_size: '10MB' });
  console.log(`  ✓ Step ${step1.getStepNumber()} completed\n`);

  const step2 = await trace1.step({ name: 'Parse File' });
  await step2.info('Parsing CSV file...');
  
  // Simulate parse error
  await step2.error('Failed to parse file', { 
    error: 'Invalid CSV format',
    line: 523,
  });
  await step2.fail('Invalid CSV format at line 523');
  console.log(`  ✗ Step ${step2.getStepNumber()} failed\n`);

  // Continue with recovery step
  const step3 = await trace1.step({ name: 'Cleanup' });
  await step3.info('Cleaning up temporary files...');
  await step3.finish({ files_deleted: 1 });
  console.log(`  ✓ Step ${step3.getStepNumber()} completed\n`);

  await trace1.finish({ 
    success: false,
    partial_completion: true,
  });
  console.log('✓ Trace finished (with step failure)\n\n');

  // Example 2: Trace failure with auto-close
  console.log('→ Example 5b: Trace failure (auto-close steps)\n');
  const trace2 = await client.trace({
    job_type: 'api_sync',
    title: 'API Sync with Trace Failure',
  });

  await trace2.start();

  const step4 = await trace2.step({ name: 'Connect to API' });
  await step4.info('Establishing connection...');
  await step4.finish({ status: 'connected' });
  console.log(`  ✓ Step ${step4.getStepNumber()} completed\n`);

  const step5 = await trace2.step({ name: 'Fetch Data' });
  await step5.info('Fetching data from API...');
  // Don't close this step - simulate getting stuck

  const step6 = await trace2.step({ name: 'Process Data' });
  // Don't close this step either

  console.log(`  → Step ${step5.getStepNumber()} still OPEN`);
  console.log(`  → Step ${step6.getStepNumber()} still OPEN\n`);

  // Fail the entire trace - this will auto-close all open steps
  await trace2.fail('API connection timeout after 30s');
  console.log(`  ✗ Trace failed - all open steps auto-closed`);
  console.log(`    Step ${step5.getStepNumber()} closed: ${step5.isClosed()}`);
  console.log(`    Step ${step6.getStepNumber()} closed: ${step6.isClosed()}\n\n`);

  // Example 3: Try-catch pattern
  console.log('→ Example 5c: Try-catch pattern\n');
  const trace3 = await client.trace({
    job_type: 'database_migration',
    title: 'Database Migration',
  });

  await trace3.start();

  const step7 = await trace3.step({ name: 'Backup Database' });
  
  try {
    await step7.info('Creating database backup...');
    
    // Simulate error
    throw new Error('Disk full - cannot create backup');
    
  } catch (error: any) {
    await step7.error('Backup failed', { 
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    await step7.fail(error.message);
    await trace3.fail(`Migration aborted: ${error.message}`);
    
    console.log(`  ✗ Step ${step7.getStepNumber()} failed: ${error.message}`);
    console.log(`  ✗ Trace failed\n`);
  }

  await client.disconnect();
  console.log('✓ Disconnected from Kafka\n');
}

if (require.main === module) {
  errorHandling().catch(console.error);
}

export { errorHandling };

