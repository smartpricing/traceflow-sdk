/**
 * Kafka Transport Implementation
 * Sends events to Kafka topic with idempotent producer
 */

import { TraceEvent, TraceTransport, KafkaConfig } from '../types';
import { LoggerLike } from '../logger';
import { sanitizePayload } from './sanitize';

export interface KafkaTransportConfig extends KafkaConfig {
  topic?: string;
  silentErrors?: boolean;
}

/**
 * Kafka Transport using @confluentinc/kafka-javascript
 * Fire-and-forget from SDK perspective with ordering guarantees
 */
export class KafkaTransport implements TraceTransport {
  private producer: any; // KafkaJS Producer
  private config: KafkaTransportConfig;
  private logger: LoggerLike;
  private connected: boolean = false;
  private readonly topic: string;

  constructor(config: KafkaTransportConfig, kafkaClient?: any, logger?: LoggerLike) {
    this.config = {
      topic: 'traceflow-events',
      silentErrors: true,
      ...config,
    };
    this.topic = this.config.topic!;

    const noop = () => {};
    this.logger = logger || { debug: noop, info: noop, warn: noop, error: noop };

    // Lazy initialization - connect on first send
    if (kafkaClient) {
      this.producer = kafkaClient;
    }
  }

  /**
   * Send event to Kafka
   */
  async send(event: TraceEvent): Promise<void> {
    try {
      // Lazy connect
      if (!this.connected) {
        await this.connect();
      }

      // Send to Kafka with trace_id as partition key for ordering
      await this.producer.send({
        topic: this.topic,
        messages: [
          {
            key: event.trace_id, // Ensures ordering per trace
            value: JSON.stringify(sanitizePayload(event)),
            headers: {
              event_type: event.event_type,
              trace_id: event.trace_id,
              source: event.source,
            },
          },
        ],
        // Idempotent producer settings
        acks: -1, // Wait for all replicas
        timeout: 5000,
      });
    } catch (error: any) {
      if (this.config.silentErrors) {
        this.logger.error('Error sending event (silenced):', error.message);
      } else {
        throw error;
      }
    }
  }

  /**
   * Flush pending messages
   */
  async flush(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.producer.flush();
    } catch (error: any) {
      if (!this.config.silentErrors) {
        this.logger.error('Error flushing:', error.message);
      }
    }
  }

  /**
   * Shutdown producer gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.producer.disconnect();
      this.connected = false;
      this.logger.info('Disconnected successfully');
    } catch (error: any) {
      if (!this.config.silentErrors) {
        this.logger.error('Error disconnecting:', error.message);
      }
    }
  }

  /**
   * Connect to Kafka (lazy initialization)
   */
  private async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Initialize KafkaJS client if not provided
      if (!this.producer) {
        const { KafkaJS } = await import('@confluentinc/kafka-javascript');
        
        const kafka = new KafkaJS.Kafka({
          kafkaJS: {
            brokers: this.config.brokers,
            clientId: this.config.clientId || 'traceflow-sdk',
            ssl: this.config.ssl as any, // KafkaJS types are complex
            sasl: this.config.sasl,
          },
        });

        this.producer = kafka.producer({
          kafkaJS: {
            // Idempotent producer for exactly-once semantics
            idempotent: true,
            transactionalId: undefined,
            maxInFlightRequests: 5,
            // Compression
            compression: 'snappy' as any,
          },
        });
      }

      await this.producer.connect();
      this.connected = true;
      this.logger.info('Connected successfully');
    } catch (error: any) {
      if (this.config.silentErrors) {
        this.logger.error('Connection failed (silenced):', error.message);
      } else {
        throw error;
      }
    }
  }
}

