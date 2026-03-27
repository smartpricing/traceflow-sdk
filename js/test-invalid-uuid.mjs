#!/usr/bin/env node

/**
 * Test: Invalid UUID handling
 *
 * Verifies that the backend properly rejects (or handles) invalid UUIDs
 * in trace_id, step_id, event_id, and log_id fields.
 *
 * Usage:
 *   node test-invalid-uuid.mjs --url=http://localhost:3009 --key=YOUR_KEY
 */

const BASE_URL = (() => {
  const arg = process.argv.find(a => a.startsWith('--url='));
  return arg ? arg.split('=').slice(1).join('=') : 'http://localhost:3009';
})();

const API_KEY = (() => {
  const arg = process.argv.find(a => a.startsWith('--key='));
  return arg ? arg.split('=').slice(1).join('=') : 'test-key';
})();

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const INVALID_UUIDS = [
  { label: 'empty string',              value: '' },
  { label: 'plain text',                value: 'not-a-uuid' },
  { label: 'missing dashes',            value: '550e8400e29b41d4a716446655440000' },
  { label: 'too short',                 value: '550e8400-e29b-41d4' },
  { label: 'too long',                  value: '550e8400-e29b-41d4-a716-446655440000-extra' },
  { label: 'special chars',             value: '550e8400-e29b-41d4-a716-44665544zzzz' },
  { label: 'SQL injection attempt',     value: "'; DROP TABLE traces; --" },
  { label: 'spaces',                    value: '550e8400 e29b 41d4 a716 446655440000' },
  { label: 'null string',               value: 'null' },
  { label: 'undefined string',          value: 'undefined' },
  { label: 'numeric',                   value: '12345' },
  { label: 'uuid with uppercase',       value: '550E8400-E29B-41D4-A716-446655440000' },
  { label: 'single dash wrong format',  value: '550e8400e29b-41d4-a716-446655440000' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

async function patch(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

function now() {
  return new Date().toISOString();
}

function result(label, endpoint, invalidUuid, res) {
  const ok = res.status >= 400 && res.status < 500;
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} [${res.status}] ${label} → ${invalidUuid.label} ("${invalidUuid.value}")`);
  if (!ok) {
    console.log(`     Expected 4xx, got ${res.status}. Body: ${res.body.slice(0, 200)}`);
  }
  return ok;
}

// ── Test Suites ──────────────────────────────────────────────────────────────

async function testCreateTraceWithInvalidTraceId() {
  console.log('\n── POST /api/v1/traces — invalid trace_id ──');
  let passed = 0;
  for (const inv of INVALID_UUIDS) {
    const res = await post('/api/v1/traces', {
      trace_id: inv.value,
      trace_type: 'test',
      status: 'PENDING',
      source: 'uuid-test',
      created_at: now(),
      updated_at: now(),
      title: 'Invalid UUID test',
      idempotency_key: VALID_UUID,
    });
    if (result('create trace (trace_id)', '/api/v1/traces', inv, res)) passed++;
  }
  return { passed, total: INVALID_UUIDS.length };
}

async function testUpdateTraceWithInvalidTraceId() {
  console.log('\n── PATCH /api/v1/traces/{id} — invalid trace_id in URL ──');
  let passed = 0;
  for (const inv of INVALID_UUIDS) {
    const res = await patch(`/api/v1/traces/${encodeURIComponent(inv.value)}`, {
      status: 'SUCCESS',
      updated_at: now(),
      finished_at: now(),
    });
    if (result('update trace (trace_id in URL)', 'PATCH /api/v1/traces/{id}', inv, res)) passed++;
  }
  return { passed, total: INVALID_UUIDS.length };
}

async function testCreateStepWithInvalidTraceId() {
  console.log('\n── POST /api/v1/steps — invalid trace_id ──');
  let passed = 0;
  for (const inv of INVALID_UUIDS) {
    const res = await post('/api/v1/steps', {
      trace_id: inv.value,
      step_id: VALID_UUID,
      name: 'test step',
      step_type: 'test',
      status: 'STARTED',
      started_at: now(),
      updated_at: now(),
    });
    if (result('create step (trace_id)', '/api/v1/steps', inv, res)) passed++;
  }
  return { passed, total: INVALID_UUIDS.length };
}

async function testCreateStepWithInvalidStepId() {
  console.log('\n── POST /api/v1/steps — invalid step_id ──');
  let passed = 0;
  for (const inv of INVALID_UUIDS) {
    const res = await post('/api/v1/steps', {
      trace_id: VALID_UUID,
      step_id: inv.value,
      name: 'test step',
      step_type: 'test',
      status: 'STARTED',
      started_at: now(),
      updated_at: now(),
    });
    if (result('create step (step_id)', '/api/v1/steps', inv, res)) passed++;
  }
  return { passed, total: INVALID_UUIDS.length };
}

async function testUpdateStepWithInvalidIds() {
  console.log('\n── PATCH /api/v1/steps/{traceId}/{stepId} — invalid IDs in URL ──');
  let passed = 0;
  for (const inv of INVALID_UUIDS) {
    // invalid trace_id
    const res1 = await patch(`/api/v1/steps/${encodeURIComponent(inv.value)}/${VALID_UUID}`, {
      status: 'COMPLETED',
      updated_at: now(),
      finished_at: now(),
    });
    if (result('update step (trace_id in URL)', 'PATCH /api/v1/steps/{traceId}/{stepId}', inv, res1)) passed++;

    // invalid step_id
    const res2 = await patch(`/api/v1/steps/${VALID_UUID}/${encodeURIComponent(inv.value)}`, {
      status: 'COMPLETED',
      updated_at: now(),
      finished_at: now(),
    });
    if (result('update step (step_id in URL)', 'PATCH /api/v1/steps/{traceId}/{stepId}', inv, res2)) passed++;
  }
  return { passed, total: INVALID_UUIDS.length * 2 };
}

async function testCreateLogWithInvalidTraceId() {
  console.log('\n── POST /api/v1/logs — invalid trace_id ──');
  let passed = 0;
  for (const inv of INVALID_UUIDS) {
    const res = await post('/api/v1/logs', {
      trace_id: inv.value,
      log_id: VALID_UUID,
      log_time: now(),
      level: 'INFO',
      message: 'test log',
      source: 'uuid-test',
    });
    if (result('create log (trace_id)', '/api/v1/logs', inv, res)) passed++;
  }
  return { passed, total: INVALID_UUIDS.length };
}

async function testCreateLogWithInvalidLogId() {
  console.log('\n── POST /api/v1/logs — invalid log_id ──');
  let passed = 0;
  for (const inv of INVALID_UUIDS) {
    const res = await post('/api/v1/logs', {
      trace_id: VALID_UUID,
      log_id: inv.value,
      log_time: now(),
      level: 'INFO',
      message: 'test log',
      source: 'uuid-test',
    });
    if (result('create log (log_id)', '/api/v1/logs', inv, res)) passed++;
  }
  return { passed, total: INVALID_UUIDS.length };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧 TraceFlow — Invalid UUID Test`);
  console.log(`   Endpoint: ${BASE_URL}`);
  console.log(`   API Key:  ${API_KEY.slice(0, 4)}...`);
  console.log(`   Invalid UUID variants: ${INVALID_UUIDS.length}`);

  const results = [];

  results.push({ name: 'Create trace (invalid trace_id)',       ...await testCreateTraceWithInvalidTraceId() });
  results.push({ name: 'Update trace (invalid trace_id in URL)', ...await testUpdateTraceWithInvalidTraceId() });
  results.push({ name: 'Create step (invalid trace_id)',        ...await testCreateStepWithInvalidTraceId() });
  results.push({ name: 'Create step (invalid step_id)',         ...await testCreateStepWithInvalidStepId() });
  results.push({ name: 'Update step (invalid IDs in URL)',      ...await testUpdateStepWithInvalidIds() });
  results.push({ name: 'Create log (invalid trace_id)',         ...await testCreateLogWithInvalidTraceId() });
  results.push({ name: 'Create log (invalid log_id)',           ...await testCreateLogWithInvalidLogId() });

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════');

  let totalPassed = 0;
  let totalTests = 0;

  for (const r of results) {
    const icon = r.passed === r.total ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.passed}/${r.total}`);
    totalPassed += r.passed;
    totalTests += r.total;
  }

  console.log('──────────────────────────────────────────────');
  console.log(`  Total: ${totalPassed}/${totalTests} passed`);

  if (totalPassed < totalTests) {
    console.log(`\n  ⚠️  ${totalTests - totalPassed} test(s) did NOT get a 4xx response.`);
    console.log('  The backend should validate UUIDs and reject invalid ones before hitting Cassandra.');
    process.exit(1);
  } else {
    console.log('\n  All invalid UUIDs were properly rejected with 4xx responses.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
