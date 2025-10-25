import { KafkaJS } from '@confluentinc/kafka-javascript';
import { v4 as uuidv4 } from 'uuid';

import {
  TraceFlowKafkaConfig,
  TraceFlowConfig,
  CreateTraceOptions,
  TraceOptions,
  TraceFlowKafkaTraceMessage,
  TraceFlowKafkaStepMessage,
  TraceFlowKafkaLogMessage,
  TraceFlowKafkaMessage,
  TraceFlowTraceStatus,
} from './types';
import { TraceManager } from './trace-manager';
import { TraceFlowServiceClient } from './service-client';
import { TraceCleaner } from './trace-cleaner';

/**
 * Type guard to check if config is KafkaConfig
 */
function isKafkaConfig(config: TraceFlowConfig): config is TraceFlowKafkaConfig {
  return 'brokers' in config;
}

/**
 * TraceFlowClient - Main SDK client for sending job tracking messages
 */
export class TraceFlowClient {
  private static instance?: TraceFlowClient;
  
  private kafka?: KafkaJS.Kafka;
  private producer: KafkaJS.Producer;
  private topic: string;
  private connected: boolean = false;
  private defaultSource?: string;
  private ownsProducer: boolean = true; // Track if we created the producer or received it
  private serviceClient?: TraceFlowServiceClient; // Optional service client for state recovery
  private cleaner?: TraceCleaner; // Optional cleaner for auto-cleanup
  private config: TraceFlowConfig; // Store config for cleaner initialization

  constructor(config: TraceFlowConfig, defaultSource?: string) {
    this.config = config;
    this.topic = config.topic || 'traceflow'; // Default to 'traceflow'
    this.defaultSource = defaultSource;

    // Initialize service client if URL provided
    if ('serviceUrl' in config && config.serviceUrl) {
      this.serviceClient = new TraceFlowServiceClient(config.serviceUrl);
    }

    if (isKafkaConfig(config)) {
      // Create new Kafka instance from config
      const kafkaConfig: any = {
        clientId: config.clientId || 'traceflow-sdk',
        brokers: config.brokers,
      };

      if (config.sasl) {
        kafkaConfig.sasl = config.sasl;
        kafkaConfig.ssl = config.ssl !== undefined ? config.ssl : true;
      }

      this.kafka = new KafkaJS.Kafka(kafkaConfig);
      this.producer = this.kafka.producer();
      this.ownsProducer = true;
    } else {
      // Use existing Kafka or Producer instance
      if (config.producer) {
        this.producer = config.producer;
        this.ownsProducer = false;
        this.connected = true; // Assume external producer is already connected
      } else if (config.kafka) {
        this.kafka = config.kafka;
        this.producer = this.kafka!.producer();
        this.ownsProducer = true;
      } else {
        throw new Error('KafkaInstanceConfig must provide either kafka or producer instance');
      }
    }
  }

  /**
   * Initialize the singleton instance
   * This is the recommended way to use the SDK
   */
  static initialize(config: TraceFlowConfig, defaultSource?: string): TraceFlowClient {
    if (TraceFlowClient.instance) {
      throw new Error('TraceFlowClient already initialized. Use getInstance() to get the existing instance.');
    }
    TraceFlowClient.instance = new TraceFlowClient(config, defaultSource);
    return TraceFlowClient.instance;
  }

  /**
   * Get the singleton instance
   * Must call initialize() first
   */
  static getInstance(): TraceFlowClient {
    if (!TraceFlowClient.instance) {
      throw new Error('TraceFlowClient not initialized. Call initialize() first.');
    }
    return TraceFlowClient.instance;
  }

  /**
   * Check if the singleton instance exists
   */
  static hasInstance(): boolean {
    return !!TraceFlowClient.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static reset(): void {
    TraceFlowClient.instance = undefined;
  }

  /**
   * Connect to Kafka
   * If using an external producer, this is a no-op
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.ownsProducer) {
      await this.producer.connect();
    }
    
    this.connected = true;

    // Initialize cleaner if config provided and serviceUrl is available
    if ('cleanerConfig' in this.config && this.config.cleanerConfig && this.serviceClient) {
      const cleanerConfig = this.config.cleanerConfig;
      
      this.cleaner = new TraceCleaner({
        serviceClient: this.serviceClient,
        kafkaProducer: this.producer,
        topic: this.topic,
        inactivityTimeoutSeconds: cleanerConfig.inactivityTimeoutSeconds,
        cleanupIntervalSeconds: cleanerConfig.cleanupIntervalSeconds,
        autoStart: cleanerConfig.autoStart !== false, // Default to true
        logger: cleanerConfig.logger,
      });
    }
  }

  /**
   * Disconnect from Kafka
   * If using an external producer, this is a no-op (external code should manage disconnection)
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // Stop cleaner if running
    if (this.cleaner) {
      this.cleaner.stop();
    }

    if (this.ownsProducer) {
      await this.producer.disconnect();
    }
    
    this.connected = false;
  }

  /**
   * Send a message to Kafka
   */
  private async sendMessage(
    type: 'trace' | 'step' | 'log',
    data: TraceFlowKafkaTraceMessage | TraceFlowKafkaStepMessage | TraceFlowKafkaLogMessage
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const message: TraceFlowKafkaMessage = {
      type,
      data,
    };

    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: 'trace_id' in data ? data.trace_id : '',
          value: JSON.stringify(message),
        },
      ],
    });
  }

  /**
   * Start a new trace
   * Returns a TraceManager instance to manage the trace
   * @param options - Trace creation options
   * @param traceOptions - Trace behavior options (e.g., autoCloseSteps)
   */
  async trace(options: CreateTraceOptions = {}, traceOptions?: TraceOptions): Promise<TraceManager> {
    const traceId = uuidv4();
    const now = new Date().toISOString();

    const source = options.source || this.defaultSource;

    const data: TraceFlowKafkaTraceMessage = {
      trace_id: traceId,
      trace_type: options.trace_type,
      status: options.status || TraceFlowTraceStatus.PENDING,
      source,
      created_at: now,
      updated_at: now,
      title: options.title,
      description: options.description,
      owner: options.owner,
      tags: options.tags,
      metadata: options.metadata,
      params: options.params,
    };

    await this.sendMessage('trace', data);

    // Return a TraceManager for this trace
    return new TraceManager(traceId, source, this.sendMessage.bind(this), traceOptions);
  }

  /**
   * Get a TraceManager for an existing trace
   * Useful if you need to update a trace from a different process/instance
   * 
   * @param traceId - The trace ID (UUID)
   * @param source - Optional source identifier
   * @param traceOptions - Optional trace options
   * @returns TraceManager instance for the existing trace
   * 
   * @example
   * ```typescript
   * // In another process/service, resume an existing trace
   * const trace = client.getTrace('existing-trace-uuid');
   * await trace.update({ status: 'RUNNING' });
   * 
   * const step = trace.getStep(0);
   * await step.finish();
   * ```
   */
  getTrace(traceId: string, source?: string, traceOptions?: TraceOptions): TraceManager {
    return new TraceManager(
      traceId,
      source || this.defaultSource,
      this.sendMessage.bind(this),
      traceOptions,
      this.serviceClient // Pass service client for state recovery
    );
  }

  /**
   * Get the service client (if configured)
   * Useful for querying trace/step state
   */
  getServiceClient(): TraceFlowServiceClient | undefined {
    return this.serviceClient;
  }

  /**
   * Check if service client is configured
   */
  hasServiceClient(): boolean {
    return !!this.serviceClient;
  }

  /**
   * Send a raw message to Kafka
   * Use this if you need more control over the message format
   */
  async sendRawMessage(
    type: 'trace' | 'step' | 'log',
    data: TraceFlowKafkaTraceMessage | TraceFlowKafkaStepMessage | TraceFlowKafkaLogMessage
  ): Promise<void> {
    await this.sendMessage(type, data);
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the configured topic
   */
  getTopic(): string {
    return this.topic;
  }

  /**
   * Get the default source
   */
  getDefaultSource(): string | undefined {
    return this.defaultSource;
  }

  /**
   * Get the cleaner instance (if configured)
   * Useful for manual control of the cleaner
   */
  getCleaner(): TraceCleaner | undefined {
    return this.cleaner;
  }

  /**
   * Check if cleaner is configured and running
   */
  hasActiveCleaner(): boolean {
    return !!this.cleaner && this.cleaner.isActive();
  }
}

