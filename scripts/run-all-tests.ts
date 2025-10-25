/**
 * Run All Test Scripts
 * Executes all test scripts in sequence
 */

import { test01BasicTrace } from './test-01-basic-trace';
import { test02AutoClose } from './test-02-autoclose-steps';
import { test03PendingSteps } from './test-03-pending-steps';
import { test04ErrorHandling } from './test-04-error-handling';
import { test05Logging } from './test-05-logging-levels';
import { test06StepState } from './test-06-step-state';
import { test07ManualStepNumbers } from './test-07-manual-step-numbers';
import { test08MultiplTraces } from './test-08-multiple-traces';
import { test09LargeWorkflow } from './test-09-large-workflow';
import { test10Metadata } from './test-10-metadata';
import { test11ResumingTraces } from './test-11-resuming-traces';

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         TraceFlow SDK - Test Suite                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const tests = [
    { name: 'TEST 01: Basic Trace Flow', fn: test01BasicTrace },
    { name: 'TEST 02: Auto-Close Steps', fn: test02AutoClose },
    { name: 'TEST 03: Pending Steps Auto-Close', fn: test03PendingSteps },
    { name: 'TEST 04: Error Handling', fn: test04ErrorHandling },
    { name: 'TEST 05: Logging Levels', fn: test05Logging },
    { name: 'TEST 06: Step State Management', fn: test06StepState },
    { name: 'TEST 07: Manual Step Numbers', fn: test07ManualStepNumbers },
    { name: 'TEST 08: Multiple Concurrent Traces', fn: test08MultiplTraces },
    { name: 'TEST 09: Large Workflow', fn: test09LargeWorkflow },
    { name: 'TEST 10: Metadata & Rich Data', fn: test10Metadata },
    { name: 'TEST 11: Resuming Traces & Steps', fn: test11ResumingTraces },
  ];

  let passed = 0;
  let failed = 0;
  const results: { name: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];

  for (const test of tests) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running: ${test.name}`);
      console.log(`${'='.repeat(60)}\n`);
      
      await test.fn();
      passed++;
      results.push({ name: test.name, status: 'PASS' });
      
      console.log(`✓ ${test.name} - PASSED\n`);
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      failed++;
      results.push({ 
        name: test.name, 
        status: 'FAIL', 
        error: error.message,
      });
      console.error(`✗ ${test.name} - FAILED:`, error.message);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Results                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  results.forEach(result => {
    const status = result.status === 'PASS' ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} - ${result.name}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  });

  console.log('\n' + '─'.repeat(60));
  console.log(`Total Tests: ${tests.length}`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log('─'.repeat(60) + '\n');

  if (failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the output above.');
    process.exit(1);
  }
}

// Run all tests
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

export { runAllTests };

