#!/usr/bin/env node

/**
 * TraceFlow JS SDK — Battle Test
 *
 * Usage:
 *   node battle-test.mjs --url=http://localhost:3001 --key=YOUR_KEY
 *   node battle-test.mjs --url=... --key=... --traces=1000 --steps=5 --logs=3
 */

import { TraceFlowSDK } from './dist/index.js';
import { randomUUID } from 'crypto';

// ── Parse CLI args ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--(\w[\w-]*)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

const args = parseArgs();

if (args.help || !args.url || !args.key) {
  console.log(`
  TraceFlow JS SDK — Battle Test

  Usage:
    node battle-test.mjs --url=<traceflow_url> --key=<api_key> [options]

  Options:
    --traces=N        Number of traces (default: 100)
    --steps=N         Steps per trace (default: 3)
    --logs=N          Logs per entity (default: 2)
    --error-rate=N    Percentage of traces that fail (default: 20)
    --source=NAME     Source identifier (default: sdk-js-exec-<uuid>)
  `);
  process.exit(1);
}

const url = args.url;
const apiKey = args.key;
const totalTraces = parseInt(args.traces ?? '100', 10);
const stepsPerTrace = parseInt(args.steps ?? '3', 10);
const logsPerEntity = parseInt(args.logs ?? '2', 10);
const errorRate = parseInt(args['error-rate'] ?? '20', 10);
const uniqueId = randomUUID().slice(0, 8);
const source = args.source ?? `sdk-js-exec-${uniqueId}`;

// ── Stats ───────────────────────────────────────────────────────────────────

const stats = {
  eventsSent: 0,
  tracesOk: 0,
  tracesFailed: 0,
  stepsOk: 0,
  stepsFailed: 0,
  logsSent: 0,
  errors: 0,
  errorMessages: [],
  latencies: [],
};

const traceTypes = ['api_request', 'job_processing', 'cron_task', 'webhook', 'user_action', 'batch_import'];
const stepNames = ['validate_input', 'fetch_data', 'transform', 'persist', 'notify', 'cleanup'];
const logLevels = ['DEBUG', 'INFO', 'WARN'];
const errorMsgs = [
  'Connection timeout after 5000ms',
  'Invalid response format from upstream',
  'Rate limit exceeded (429)',
  'Database deadlock detected',
  'Out of memory in worker process',
  'Validation failed: missing required field "id"',
];

const expectedEvents = totalTraces * (
  1 +                                             // trace_started
  1 +                                             // trace_finished/failed
  logsPerEntity +                                 // trace-level logs
  stepsPerTrace * (1 + 1 + logsPerEntity)         // step_started + step_finished/failed + step logs
);

// ── Banner ──────────────────────────────────────────────────────────────────

console.log('');
console.log('  =======================================');
console.log('    TraceFlow JS SDK — Battle Test');
console.log('  =======================================');
console.log('');
console.log(`  Target:          ${url}`);
console.log(`  Source:          ${source}`);
console.log(`  Traces:          ${totalTraces}`);
console.log(`  Steps/trace:     ${stepsPerTrace}`);
console.log(`  Logs/entity:     ${logsPerEntity}`);
console.log(`  Error rate:      ${errorRate}%`);
console.log(`  Expected events: ~${expectedEvents}`);
console.log('');

// ── Create SDK ──────────────────────────────────────────────────────────────

const sdk = new TraceFlowSDK({
  transport: 'http',
  source,
  endpoint: url,
  apiKey,
  timeout: 15000,
  maxRetries: 3,
  retryDelay: 500,
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 100,
  circuitBreakerTimeout: 3000,
  silentErrors: false,
  enableLogging: false,
  autoFlushOnExit: false,
});

// ── Run battle test ─────────────────────────────────────────────────────────

async function runSingleTrace(index) {
  const shouldFail = Math.random() * 100 < errorRate;
  const traceStart = performance.now();
  const traceType = traceTypes[index % traceTypes.length];

  // Start trace
  const trace = await sdk.startTrace({
    trace_type: traceType,
    title: `Battle trace #${index}`,
    description: shouldFail ? 'Will simulate failure' : 'Normal execution',
    owner: 'battle-test',
    tags: ['battle-test', shouldFail ? 'error' : 'success'],
    metadata: {
      batch_index: index,
      will_fail: shouldFail,
      node_version: process.version,
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
    },
  });
  stats.eventsSent++;

  // Trace-level logs
  for (let l = 0; l < logsPerEntity; l++) {
    await trace.log(`Trace #${index} log entry ${l}`, {
      level: logLevels[l % logLevels.length],
      eventType: 'trace_activity',
      details: { log_index: l },
    });
    stats.eventsSent++;
    stats.logsSent++;
  }

  // Steps
  const failAtStep = shouldFail ? Math.floor(Math.random() * stepsPerTrace) : -1;

  for (let s = 0; s < stepsPerTrace; s++) {
    const stepShouldFail = (s === failAtStep);
    const stepName = stepNames[s % stepNames.length];

    const step = await trace.startStep({
      name: `${stepName}_${s}`,
      stepType: stepName,
      input: { trace_index: index, step_index: s, payload_size: Math.floor(Math.random() * 10000) + 100 },
      metadata: { attempt: 1 },
    });
    stats.eventsSent++;

    // Step-level logs
    for (let l = 0; l < logsPerEntity; l++) {
      await step.log(`Step ${stepName}_${s} log ${l}`, {
        level: stepShouldFail && l === logsPerEntity - 1 ? 'ERROR' : 'INFO',
        eventType: 'step_activity',
        details: { detail: `Processing item ${l}` },
      });
      stats.eventsSent++;
      stats.logsSent++;
    }

    // Finish or fail step
    if (stepShouldFail) {
      await step.fail(errorMsgs[Math.floor(Math.random() * errorMsgs.length)]);
      stats.eventsSent++;
      stats.stepsFailed++;
    } else {
      await step.finish({
        output: { records_processed: Math.floor(Math.random() * 1000) + 1 },
        metadata: { cache_hit: Math.random() > 0.5 },
      });
      stats.eventsSent++;
      stats.stepsOk++;
    }
  }

  // Finish or fail trace
  if (shouldFail) {
    await trace.fail(`Simulated failure at step ${failAtStep}`);
    stats.eventsSent++;
    stats.tracesFailed++;
  } else {
    await trace.finish({
      result: { total_steps: stepsPerTrace, status: 'all_ok' },
      metadata: { completion_time_ms: Math.round(performance.now() - traceStart) },
    });
    stats.eventsSent++;
    stats.tracesOk++;
  }

  stats.latencies.push(performance.now() - traceStart);
}

async function main() {
  // Connectivity check
  process.stdout.write('  Checking connectivity... ');
  try {
    const res = await fetch(`${url}/api/v1/health`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      console.log(`\x1b[32mOK (HTTP ${res.status})\x1b[0m`);
    } else if (res.status === 404) {
      console.log(`\x1b[33mOK (no health endpoint)\x1b[0m`);
    } else {
      console.log(`\x1b[31mFAILED (HTTP ${res.status})\x1b[0m`);
      process.exit(1);
    }
  } catch (e) {
    console.log(`\x1b[31mFAILED — ${e.message}\x1b[0m`);
    process.exit(1);
  }

  console.log('');
  const globalStart = performance.now();

  for (let i = 0; i < totalTraces; i++) {
    try {
      await runSingleTrace(i);
    } catch (e) {
      stats.errors++;
      stats.errorMessages.push(e.message);
      if (stats.errors <= 5) {
        console.log(`\x1b[31m  ! Error on trace #${i}: ${e.message}\x1b[0m`);
      }
    }

    // Progress
    if ((i + 1) % 10 === 0 || i === totalTraces - 1) {
      const pct = Math.round((i + 1) / totalTraces * 100);
      const elapsed = ((performance.now() - globalStart) / 1000).toFixed(1);
      process.stdout.write(`\r  [${pct}%] ${i + 1}/${totalTraces} traces | OK: ${stats.tracesOk} | FAIL(sim): ${stats.tracesFailed} | ERR: ${stats.errors} | ${elapsed}s`);
    }
  }

  // Final flush
  console.log('\n');
  process.stdout.write('  Flushing remaining events... ');
  const flushStart = performance.now();

  try {
    await sdk.shutdown();
    const flushTime = Math.round(performance.now() - flushStart);
    console.log(`\x1b[32mdone (${flushTime}ms)\x1b[0m`);
  } catch (e) {
    stats.errors++;
    console.log(`\x1b[31merror: ${e.message}\x1b[0m`);
  }

  const totalTime = (performance.now() - globalStart) / 1000;

  // ── Results ───────────────────────────────────────────────────────────────

  console.log('');
  console.log('  =======================================');
  console.log('    Results');
  console.log('  =======================================');
  console.log('');
  console.log(`  Total time:         ${totalTime.toFixed(2)}s`);
  console.log(`  Events sent:        ${stats.eventsSent} / ${expectedEvents} expected`);
  console.log(`  Throughput:         ${Math.round(stats.eventsSent / Math.max(totalTime, 0.001))} events/sec`);
  console.log('');
  console.log(`  Traces OK:          ${stats.tracesOk}`);
  console.log(`  Traces Failed:      ${stats.tracesFailed} (simulated)`);
  console.log(`  Steps OK:           ${stats.stepsOk}`);
  console.log(`  Steps Failed:       ${stats.stepsFailed} (simulated)`);
  console.log(`  Logs sent:          ${stats.logsSent}`);
  console.log('');

  if (stats.errors > 0) {
    console.log(`\x1b[31m  SDK/Transport errors: ${stats.errors}\x1b[0m`);
    const unique = [...new Set(stats.errorMessages)];
    for (const msg of unique.slice(0, 10)) {
      console.log(`\x1b[31m    - ${msg}\x1b[0m`);
    }
  } else {
    console.log(`\x1b[32m  SDK/Transport errors: 0\x1b[0m`);
  }

  // Latency stats
  if (stats.latencies.length > 0) {
    stats.latencies.sort((a, b) => a - b);
    const count = stats.latencies.length;
    const avg = stats.latencies.reduce((a, b) => a + b, 0) / count;
    const p50 = stats.latencies[Math.floor(count * 0.50)];
    const p95 = stats.latencies[Math.min(Math.floor(count * 0.95), count - 1)];
    const p99 = stats.latencies[Math.min(Math.floor(count * 0.99), count - 1)];
    const min = stats.latencies[0];
    const max = stats.latencies[count - 1];

    console.log('');
    console.log('  Per-trace latency (SDK-side, ms):');
    console.log(`    min: ${min.toFixed(1)}  avg: ${avg.toFixed(1)}  p50: ${p50.toFixed(1)}  p95: ${p95.toFixed(1)}  p99: ${p99.toFixed(1)}  max: ${max.toFixed(1)}`);
  }

  const mem = process.memoryUsage();
  console.log('');
  console.log(`  Memory: heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB / rss ${Math.round(mem.rss / 1024 / 1024)}MB`);
  console.log('');

  if (stats.errors === 0) {
    console.log('\x1b[32m  ✓ Battle test PASSED — all events sent successfully.\x1b[0m');
  } else {
    console.log(`\x1b[31m  ✗ Battle test COMPLETED WITH ERRORS — ${stats.errors} transport/SDK errors.\x1b[0m`);
  }
  console.log('');

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nFatal: ${e.message}`);
  process.exit(1);
});
