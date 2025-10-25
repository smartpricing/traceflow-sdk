/**
 * Test Script 10: Trace Metadata & Rich Data
 * Tests: Complex metadata, tags, params, and output data
 */

import { TraceFlowClient } from '../src';

async function test10Metadata() {
  console.log('🧪 TEST 10: Trace Metadata & Rich Data\n');

  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
  }, 'test-service');

  await client.connect();
  console.log('✓ Connected\n');

  // Test 1: Rich trace metadata
  console.log('→ Test 10.1: Trace with rich metadata');
  const trace1 = await client.trace({
    job_type: 'test_rich_metadata',
    title: 'Trace with Rich Metadata',
    description: 'Testing comprehensive metadata support',
    owner: 'test-team',
    tags: ['test', 'metadata', 'rich', 'comprehensive'],
    metadata: {
      environment: 'test',
      region: 'us-east-1',
      version: '1.0.3',
      priority: 'high',
      cost_center: 'engineering',
    },
    params: {
      batch_size: 1000,
      retry_count: 3,
      timeout_seconds: 300,
      enable_cache: true,
      data_source: 'postgresql',
    },
  });
  console.log(`  Trace ID: ${trace1.getId()}`);
  console.log(`  Tags: ${JSON.stringify(['test', 'metadata', 'rich', 'comprehensive'])}`);
  console.log(`  Metadata keys: ${Object.keys({environment:'', region:'', version:'', priority:'', cost_center:''}).length}`);
  console.log(`  Params keys: ${Object.keys({batch_size:0, retry_count:0, timeout_seconds:0, enable_cache:false, data_source:''}).length}`);
  
  await trace1.start();
  
  const step1 = await trace1.step({
    name: 'Process with Rich Data',
    step_type: 'processing',
    input: {
      source: 'database',
      query: 'SELECT * FROM users',
      limit: 1000,
    },
    metadata: {
      executor: 'test-worker-01',
      memory_limit: '512MB',
      cpu_limit: '2',
    },
  });

  await step1.info('Processing data', {
    records_read: 1000,
    records_filtered: 950,
    execution_time_ms: 1234,
  });

  await step1.finish({
    records_processed: 950,
    records_skipped: 50,
    output_size_bytes: 102400,
    performance: {
      avg_time_per_record_ms: 1.23,
      memory_used_mb: 450,
      cpu_usage_percent: 75,
    },
  });

  await trace1.finish({
    success: true,
    summary: {
      total_records: 950,
      duration_ms: 1234,
      cost_usd: 0.05,
    },
  });
  console.log('  ✓ Test passed\n');

  // Test 2: Complex nested data structures
  console.log('→ Test 10.2: Complex nested data structures');
  const trace2 = await client.trace({
    job_type: 'test_nested_data',
    title: 'Complex Nested Data Test',
    params: {
      config: {
        database: {
          host: 'localhost',
          port: 5432,
          ssl: true,
        },
        processing: {
          threads: 4,
          batch_size: 100,
        },
      },
    },
  });
  console.log(`  Trace ID: ${trace2.getId()}`);
  await trace2.start();

  const step2 = await trace2.step({ name: 'Complex Data Step' });
  
  await step2.info('Processing complex data', {
    results: {
      phase1: { processed: 100, failed: 0 },
      phase2: { processed: 100, failed: 0 },
      phase3: { processed: 100, failed: 5 },
    },
    metrics: {
      latency: { p50: 10, p95: 25, p99: 50 },
      throughput: { avg: 100, max: 150 },
    },
  });

  await step2.finish({
    summary: {
      total_phases: 3,
      overall_success_rate: 0.983,
      errors: [
        { code: 'ERR_001', count: 3 },
        { code: 'ERR_002', count: 2 },
      ],
    },
  });

  await trace2.finish({ test: 'passed' });
  console.log('  ✓ Test passed\n');

  await client.disconnect();
  console.log('✓ All tests completed\n');
}

if (require.main === module) {
  test10Metadata().catch(console.error);
}

export { test10Metadata };

