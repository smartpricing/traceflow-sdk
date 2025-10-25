/**
 * Example 07: Complex Workflow
 * 
 * Demonstrates:
 * - Multi-step workflow with conditional logic
 * - Parallel step execution simulation
 * - Rich metadata and logging
 * - Real-world ETL pipeline scenario
 */

import { TraceFlowClient } from '../src';

async function complexWorkflow() {
  console.log('=== Example 07: Complex Workflow ===\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
    clientId: 'example-07',
  }, 'etl-service');

  await client.connect();
  console.log('✓ Connected to Kafka\n');

  // Create trace with rich metadata
  const trace = await client.trace({
    job_type: 'etl_pipeline',
    title: 'Daily Sales Data ETL',
    description: 'Extract sales data from multiple sources, transform, and load to warehouse',
    owner: 'data-team',
    tags: ['etl', 'sales', 'daily'],
    params: {
      date: '2024-10-24',
      sources: ['shopify', 'amazon', 'ebay'],
      destination: 'snowflake',
    },
    metadata: {
      env: 'production',
      region: 'us-east-1',
      version: '2.1.0',
    },
  });

  console.log(`✓ Created trace: ${trace.getJobId()}`);
  console.log(`  Job type: etl_pipeline`);
  console.log(`  Owner: data-team\n`);

  await trace.start();
  await trace.info('Starting ETL pipeline', {
    scheduled_time: '02:00 UTC',
    trigger: 'cron',
  });

  // Step 1: Extract from multiple sources
  const extractStep = await trace.step({
    name: 'Extract Data',
    step_type: 'extract',
    input: { sources: ['shopify', 'amazon', 'ebay'] },
  });

  await extractStep.info('Connecting to data sources...');
  await new Promise(resolve => setTimeout(resolve, 200));

  // Simulate extracting from multiple sources
  const sources = ['shopify', 'amazon', 'ebay'];
  let totalRecords = 0;

  for (const source of sources) {
    const records = Math.floor(Math.random() * 1000) + 500;
    totalRecords += records;
    await extractStep.info(`Extracted from ${source}`, { 
      source,
      records,
      duration_ms: 150 + Math.random() * 100,
    });
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await extractStep.finish({ 
    total_records: totalRecords,
    sources_count: sources.length,
  });
  console.log(`✓ Extracted ${totalRecords} records from ${sources.length} sources\n`);

  // Step 2: Data validation
  const validateStep = await trace.step({
    name: 'Validate Data',
    step_type: 'validation',
    input: { records: totalRecords },
  });

  await validateStep.info('Running validation rules...');
  await new Promise(resolve => setTimeout(resolve, 150));

  const invalidRecords = Math.floor(totalRecords * 0.05); // 5% invalid
  
  if (invalidRecords > 0) {
    await validateStep.warn(`Found ${invalidRecords} invalid records`, {
      invalid_count: invalidRecords,
      validation_rules_failed: ['missing_price', 'invalid_date', 'duplicate_id'],
    });
  }

  await validateStep.finish({ 
    valid: totalRecords - invalidRecords,
    invalid: invalidRecords,
    validation_rate: ((totalRecords - invalidRecords) / totalRecords * 100).toFixed(2) + '%',
  });
  console.log(`✓ Validated ${totalRecords - invalidRecords} records (${invalidRecords} invalid)\n`);

  // Step 3: Transform data
  const transformStep = await trace.step({
    name: 'Transform Data',
    step_type: 'transform',
    input: { valid_records: totalRecords - invalidRecords },
  });

  await transformStep.info('Applying transformations...');
  await new Promise(resolve => setTimeout(resolve, 200));

  await transformStep.debug('Transformation config', {
    operations: [
      'normalize_currency',
      'calculate_tax',
      'enrich_product_info',
      'aggregate_by_date',
    ],
  });

  const transformedRecords = totalRecords - invalidRecords;
  await transformStep.info('Transformations completed', {
    input_records: totalRecords - invalidRecords,
    output_records: transformedRecords,
    transformations_applied: 4,
  });

  await transformStep.finish({ 
    transformed: transformedRecords,
    enriched_fields: 12,
  });
  console.log(`✓ Transformed ${transformedRecords} records\n`);

  // Step 4: Load to warehouse
  const loadStep = await trace.step({
    name: 'Load to Warehouse',
    step_type: 'load',
    input: { 
      records: transformedRecords,
      destination: 'snowflake',
    },
  });

  await loadStep.info('Connecting to Snowflake warehouse...');
  await new Promise(resolve => setTimeout(resolve, 100));

  await loadStep.info('Creating staging table...');
  await new Promise(resolve => setTimeout(resolve, 150));

  await loadStep.info(`Bulk loading ${transformedRecords} records...`);
  await new Promise(resolve => setTimeout(resolve, 300));

  await loadStep.info('Merging into production table...');
  await new Promise(resolve => setTimeout(resolve, 200));

  await loadStep.finish({ 
    loaded: transformedRecords,
    table: 'sales_fact',
    warehouse: 'snowflake',
    load_method: 'bulk_merge',
  });
  console.log(`✓ Loaded ${transformedRecords} records to Snowflake\n`);

  // Step 5: Generate report
  const reportStep = await trace.step({
    name: 'Generate Report',
    step_type: 'report',
  });

  await reportStep.info('Generating ETL summary report...');
  await new Promise(resolve => setTimeout(resolve, 100));

  const report = {
    total_extracted: totalRecords,
    total_valid: totalRecords - invalidRecords,
    total_transformed: transformedRecords,
    total_loaded: transformedRecords,
    data_quality_score: (((totalRecords - invalidRecords) / totalRecords) * 100).toFixed(2) + '%',
    duration_seconds: 15,
  };

  await reportStep.finish({ report });
  console.log(`✓ Report generated\n`);

  // Finish trace with comprehensive summary
  await trace.info('ETL pipeline completed successfully', report);
  await trace.finish({ 
    success: true,
    summary: report,
    next_run: '2024-10-25 02:00 UTC',
  });
  console.log('✓ Trace finished successfully\n');
  console.log('Summary:');
  console.log(`  • Extracted: ${totalRecords} records`);
  console.log(`  • Valid: ${totalRecords - invalidRecords} records`);
  console.log(`  • Loaded: ${transformedRecords} records`);
  console.log(`  • Data Quality: ${report.data_quality_score}\n`);

  await client.disconnect();
  console.log('✓ Disconnected from Kafka\n');
}

if (require.main === module) {
  complexWorkflow().catch(console.error);
}

export { complexWorkflow };

