/**
 * Example 06: Using Existing Kafka Instance
 * 
 * Demonstrates:
 * - Using an existing Kafka client
 * - Sharing Kafka connection across multiple services
 * - Managing connection lifecycle externally
 */

import { KafkaJS } from '@confluentinc/kafka-javascript';
import { TraceFlowClient } from '../src';

const { Kafka } = KafkaJS;

async function existingKafkaInstance() {
  console.log('=== Example 06: Using Existing Kafka Instance ===\n');

  // 1. Create your own Kafka instance
  console.log('→ Creating Kafka instance...');
  const kafka = new Kafka({
    kafkaJS: {
      brokers: ['localhost:9092'],
      clientId: 'example-06-shared',
    },
  });

  const producer = kafka.producer();
  await producer.connect();
  console.log('✓ Kafka producer connected\n');

  // 2. Pass existing Kafka instance to TraceFlowClient
  console.log('→ Creating TraceFlowClient with existing Kafka instance...');
  const traceClient = new TraceFlowClient({
    kafka,
    producer,
    // topic: 'traceflow', // Optional - defaults to 'traceflow'
  }, 'shared-service');

  // Note: Don't call traceClient.connect() - connection is managed externally
  console.log('✓ TraceFlowClient created (using existing connection)\n');

  // 3. Use TraceFlowClient normally
  const trace = await traceClient.trace({
    job_type: 'shared_kafka_example',
    title: 'Using Shared Kafka Instance',
  });

  await trace.start();
  console.log(`✓ Trace started: ${trace.getJobId()}\n`);

  const step = await trace.step({ name: 'Process Data' });
  await step.info('Processing with shared Kafka connection...');
  await new Promise(resolve => setTimeout(resolve, 200));
  await step.finish({ records: 50 });
  console.log('✓ Step completed\n');

  await trace.finish({ success: true });
  console.log('✓ Trace finished\n');

  // 4. You can also use the producer for other purposes
  console.log('→ Sending custom message with same producer...');
  await producer.send({
    topic: 'custom-topic',
    messages: [
      { 
        value: JSON.stringify({ 
          type: 'custom_event',
          data: 'Using same Kafka producer',
          timestamp: new Date().toISOString(),
        }),
      },
    ],
  });
  console.log('✓ Custom message sent\n');

  // 5. Clean up - manage connection externally
  // Note: Don't call traceClient.disconnect() - you manage the connection
  console.log('→ Disconnecting Kafka producer (managed externally)...');
  await producer.disconnect();
  console.log('✓ Kafka producer disconnected\n');
}

if (require.main === module) {
  existingKafkaInstance().catch(console.error);
}

export { existingKafkaInstance };

