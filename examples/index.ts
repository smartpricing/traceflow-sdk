/**
 * Run all examples in sequence
 * This file executes all examples to demonstrate the full SDK functionality
 */

import { basicUsage } from './01-basic-usage';
import { autoCloseSteps } from './02-auto-close-steps';
import { singletonPattern } from './03-singleton-pattern';
import { stepLogging } from './04-step-logging';
import { errorHandling } from './05-error-handling';
import { existingKafkaInstance } from './06-existing-kafka-instance';
import { complexWorkflow } from './07-complex-workflow';

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         TraceFlow SDK - Running All Examples              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const examples = [
    { name: '01 - Basic Usage', fn: basicUsage },
    { name: '02 - Auto-Close Steps', fn: autoCloseSteps },
    { name: '03 - Singleton Pattern', fn: singletonPattern },
    { name: '04 - Step Logging', fn: stepLogging },
    { name: '05 - Error Handling', fn: errorHandling },
    { name: '06 - Existing Kafka Instance', fn: existingKafkaInstance },
    { name: '07 - Complex Workflow', fn: complexWorkflow },
  ];

  let successCount = 0;
  let failureCount = 0;

  for (const example of examples) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running: ${example.name}`);
      console.log(`${'='.repeat(60)}\n`);
      
      await example.fn();
      successCount++;
      
      console.log(`\n✓ ${example.name} completed successfully\n`);
      
      // Wait a bit between examples
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      failureCount++;
      console.error(`\n✗ ${example.name} failed:`, error);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Summary                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Total Examples: ${examples.length}`);
  console.log(`✓ Successful: ${successCount}`);
  console.log(`✗ Failed: ${failureCount}`);
  console.log('');

  if (failureCount === 0) {
    console.log('🎉 All examples completed successfully!');
  } else {
    console.log('⚠️  Some examples failed. Check the output above for details.');
  }
}

// Run all examples
if (require.main === module) {
  runAllExamples()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error running examples:', error);
      process.exit(1);
    });
}

export { runAllExamples };

