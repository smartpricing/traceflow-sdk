# TraceFlow SDK - Test Scripts

This directory contains test scripts to verify all SDK functionality. Each script tests specific features and can be run independently.

## 📋 Test Scripts Overview

### Test 01: Basic Trace Flow
**File:** `test-01-basic-trace.ts`

**Tests:**
- Basic trace creation
- Manual step creation and closing
- Trace completion

**Run:**
```bash
npx ts-node scripts/test-01-basic-trace.ts
```

---

### Test 02: Auto-Close Steps
**File:** `test-02-autoclose-steps.ts`

**Tests:**
- `autoCloseSteps: true` option
- `autoCloseSteps: false` (default)
- Step state verification

**Run:**
```bash
npx ts-node scripts/test-02-autoclose-steps.ts
```

---

### Test 03: Pending Steps Auto-Close
**File:** `test-03-pending-steps.ts`

**Tests:**
- Pending steps closed on `trace.finish()`
- Pending steps closed on `trace.fail()`
- Pending steps closed on `trace.cancel()`

**Run:**
```bash
npx ts-node scripts/test-03-pending-steps.ts
```

---

### Test 04: Error Handling
**File:** `test-04-error-handling.ts`

**Tests:**
- Failed step, successful trace
- Failed trace with pending steps
- Error logging

**Run:**
```bash
npx ts-node scripts/test-04-error-handling.ts
```

---

### Test 05: Logging Levels
**File:** `test-05-logging-levels.ts`

**Tests:**
- Step-level logging (DEBUG, INFO, WARN, ERROR)
- Trace-level logging
- Logging with structured details

**Run:**
```bash
npx ts-node scripts/test-05-logging-levels.ts
```

---

### Test 06: Step State Management
**File:** `test-06-step-state.ts`

**Tests:**
- Step state transitions
- `getStepNumber()` method
- `isClosed()` method
- Step update restrictions on closed steps

**Run:**
```bash
npx ts-node scripts/test-06-step-state.ts
```

---

### Test 07: Manual Step Numbers
**File:** `test-07-manual-step-numbers.ts`

**Tests:**
- Manual step numbering
- Auto-increment after manual numbers
- Mixed manual and auto numbering

**Run:**
```bash
npx ts-node scripts/test-07-manual-step-numbers.ts
```

---

### Test 08: Multiple Concurrent Traces
**File:** `test-08-multiple-traces.ts`

**Tests:**
- Creating multiple traces concurrently
- Managing multiple traces in parallel
- Sequential trace creation

**Run:**
```bash
npx ts-node scripts/test-08-multiple-traces.ts
```

---

### Test 09: Large Workflow
**File:** `test-09-large-workflow.ts`

**Tests:**
- Traces with many steps (20+ steps)
- Large workflow performance
- Auto-close with many steps

**Run:**
```bash
npx ts-node scripts/test-09-large-workflow.ts
```

---

### Test 10: Metadata & Rich Data
**File:** `test-10-metadata.ts`

**Tests:**
- Rich trace metadata (tags, owner, description)
- Complex params and metadata
- Nested data structures
- Step input/output data

**Run:**
```bash
npx ts-node scripts/test-10-metadata.ts
```

---

## 🚀 Running Tests

### Prerequisites

1. **Kafka Running:**
   ```bash
   # Using Docker
   docker run -d -p 9092:9092 \
     -e KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181 \
     -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
     -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
     confluentinc/cp-kafka
   ```

2. **Build SDK:**
   ```bash
   npm run build
   ```

### Run Individual Tests

```bash
# Run a specific test
npx ts-node scripts/test-01-basic-trace.ts
npx ts-node scripts/test-02-autoclose-steps.ts
# ... etc
```

### Run All Tests

```bash
npx ts-node scripts/run-all-tests.ts
```

This will run all 10 tests in sequence and provide a summary report:

```
╔════════════════════════════════════════════════════════════╗
║         TraceFlow SDK - Test Suite                        ║
╚════════════════════════════════════════════════════════════╝

... test output ...

╔════════════════════════════════════════════════════════════╗
║                    Test Results                            ║
╚════════════════════════════════════════════════════════════╝

✓ PASS - TEST 01: Basic Trace Flow
✓ PASS - TEST 02: Auto-Close Steps
✓ PASS - TEST 03: Pending Steps Auto-Close
✓ PASS - TEST 04: Error Handling
✓ PASS - TEST 05: Logging Levels
✓ PASS - TEST 06: Step State Management
✓ PASS - TEST 07: Manual Step Numbers
✓ PASS - TEST 08: Multiple Concurrent Traces
✓ PASS - TEST 09: Large Workflow
✓ PASS - TEST 10: Metadata & Rich Data

─────────────────────────────────────────────────────
Total Tests: 10
✓ Passed: 10
✗ Failed: 0
─────────────────────────────────────────────────────

🎉 All tests passed!
```

---

## 📊 Test Coverage

These tests cover:

✅ Basic functionality (trace creation, steps, completion)  
✅ Auto-close features (autoCloseSteps option, pending steps)  
✅ Error handling (step failures, trace failures)  
✅ Logging (all log levels, step and trace level)  
✅ Step state management (isClosed, getStepNumber)  
✅ Step numbering (auto-increment, manual numbering)  
✅ Concurrent operations (multiple traces)  
✅ Large workflows (many steps)  
✅ Rich metadata (tags, params, nested data)  
✅ Default topic behavior (topic defaults to 'traceflow')

---

## 🔍 Inspecting Kafka Messages

To see the messages sent to Kafka during tests:

```bash
# Using Kafka console consumer
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic traceflow \
  --from-beginning \
  --property print.key=true \
  --property print.timestamp=true

# Using kcat (kafkacat)
kcat -b localhost:9092 -t traceflow -C -f 'Topic: %t [%p] @ %o\nKey: %k\nValue: %s\n---\n'
```

---

## 🧪 Test Structure

Each test script:
1. Creates a client and connects to Kafka
2. Runs 1-2 focused tests
3. Verifies expected behavior
4. Prints clear pass/fail results
5. Disconnects cleanly

**Example output:**
```
🧪 TEST 01: Basic Trace Flow

✓ Connected

→ Test 1.1: Simple trace with 3 steps
  Trace ID: 550e8400-e29b-41d4-a716-446655440000
  Status: RUNNING
  Created step 0: OPEN
  Step 0 finished: CLOSED
  Created step 1: OPEN
  Step 1 finished: CLOSED
  Created step 2: OPEN
  Step 2 finished: CLOSED
  Trace finished: SUCCESS

✓ Test completed
```

---

## 💡 Tips

1. **Run tests in order** - Start with `test-01` to verify basic functionality
2. **Watch Kafka messages** - Use console consumer to see actual messages
3. **Clean topic** - Delete and recreate topic between test runs for clean slate
4. **Modify tests** - Feel free to modify tests to experiment with features
5. **Add tests** - Create new test files following the same pattern

---

## 🐛 Troubleshooting

**Connection errors:**
```bash
# Check Kafka is running
docker ps | grep kafka

# Check Kafka logs
docker logs <kafka-container-id>
```

**Build errors:**
```bash
# Rebuild SDK
npm run build
```

**TypeScript errors:**
```bash
# Check TypeScript version
npx tsc --version

# Run type check only
npx tsc --noEmit
```

---

## 📚 Related Documentation

- **[Examples](../examples/README.md)** - Detailed usage examples
- **[Main README](../README.md)** - SDK documentation
- **[CHANGELOG](../CHANGELOG.md)** - Version history

---

## 🤝 Contributing

To add a new test:
1. Create `test-XX-your-test.ts` in this directory
2. Follow the existing test structure
3. Add it to `run-all-tests.ts`
4. Update this README
5. Verify it passes with `npm run build && npx ts-node scripts/test-XX-your-test.ts`

