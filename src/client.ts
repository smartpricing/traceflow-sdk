import { KafkaJS } from '@confluentinc/kafka-javascript';
import { v4 as uuidv4 } from 'uuid';
import { createClient, RedisClientType } from 'redis';

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
import { TraceFlowRedisClient } from './redis-client';
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
  private redisClient?: TraceFlowRedisClient; // Optional Redis client for state persistence
  private ownsRedisClient: boolean = false; // Track if we created the Redis client
  private cleaner?: TraceCleaner; // Optional cleaner for auto-cleanup
  private config: TraceFlowConfig; // Store config for cleaner initialization

  constructor(config: TraceFlowConfig, defaultSource?: string) {
    this.config = config;
    this.topic = config.topic || 'traceflow'; // Default to 'traceflow'
    this.defaultSource = defaultSource;

    console.log(`[TraceFlow Client] Initializing TraceFlow SDK (topic: ${this.topic}, source: ${defaultSource || 'none'})`);

    // Initialize Redis client if provided
    if (config.redisClient) {
      // Use existing Redis client
      console.log('[TraceFlow Client] Using existing Redis client');
      this.redisClient = new TraceFlowRedisClient(config.redisClient);
      this.ownsRedisClient = false;
    } else if (config.redisUrl) {
      // Create new Redis client from URL
      console.log(`[TraceFlow Client] Creating new Redis client (url: ${config.redisUrl})`);
      const client = createClient({ url: config.redisUrl });
      this.redisClient = new TraceFlowRedisClient(client as RedisClientType);
      this.ownsRedisClient = true;
    } else {
      console.log('[TraceFlow Client] ⚠️ No Redis configuration provided - state persistence disabled');
    }

    if (isKafkaConfig(config)) {
      // Create new Kafka instance from config
      const kafkaConfig: any = {
        brokers: config.brokers,
        kafkaJS: {
          clientId: config.clientId || 'traceflow-sdk',
        },
      };

      if (config.sasl) {
        kafkaConfig.kafkaJS.sasl = config.sasl;
        kafkaConfig.kafkaJS.ssl = config.ssl !== undefined ? config.ssl : true;
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
   * Connect to Kafka and Redis
   * If using an external producer, Kafka connection is a no-op
   */
  async connect(): Promise<void> {
    if (this.connected) {
      console.log('[TraceFlow Client] Already connected');
      return;
    }

    console.log('[TraceFlow Client] Connecting to Kafka and Redis...');

    if (this.ownsProducer) {
      console.log('[TraceFlow Client] Connecting to Kafka...');
      await this.producer.connect();
      console.log('[TraceFlow Client] ✅ Kafka connected');
    } else {
      console.log('[TraceFlow Client] Using external Kafka producer (already connected)');
    }

    // Connect to Redis if we own the client
    if (this.redisClient && this.ownsRedisClient) {
      await this.redisClient.connect();
    } else if (this.redisClient) {
      console.log('[TraceFlow Client] Using external Redis client (already connected)');
    }
    
    this.connected = true;
    console.log('[TraceFlow Client] ✅ TraceFlow SDK connected successfully');

    // Initialize cleaner if config provided and Redis is available
    if ('cleanerConfig' in this.config && this.config.cleanerConfig && this.redisClient) {
      console.log('[TraceFlow Client] Initializing TraceCleaner...');
      const cleanerConfig = this.config.cleanerConfig;
      
      this.cleaner = new TraceCleaner({
        redisClient: this.redisClient,
        kafkaProducer: this.producer,
        topic: this.topic,
        inactivityTimeoutSeconds: cleanerConfig.inactivityTimeoutSeconds,
        cleanupIntervalSeconds: cleanerConfig.cleanupIntervalSeconds,
        autoStart: cleanerConfig.autoStart !== false, // Default to true
        logger: cleanerConfig.logger,
      });
      
      console.log(`[TraceFlow Client] ✅ TraceCleaner initialized (timeout: ${cleanerConfig.inactivityTimeoutSeconds || 1800}s, interval: ${cleanerConfig.cleanupIntervalSeconds || 300}s)`);
    } else if ('cleanerConfig' in this.config && this.config.cleanerConfig && !this.redisClient) {
      console.warn('[TraceFlow Client] ⚠️ TraceCleaner config provided but Redis is not configured - cleaner disabled');
    }
  }

  /**
   * Disconnect from Kafka and Redis
   * If using external instances, this is a no-op for those (external code should manage disconnection)
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      console.log('[TraceFlow Client] Already disconnected');
      return;
    }

    console.log('[TraceFlow Client] Disconnecting from Kafka and Redis...');

    // Stop cleaner if running
    if (this.cleaner) {
      console.log('[TraceFlow Client] Stopping TraceCleaner...');
      this.cleaner.stop();
      console.log('[TraceFlow Client] ✅ TraceCleaner stopped');
    }

    if (this.ownsProducer) {
      console.log('[TraceFlow Client] Disconnecting from Kafka...');
      await this.producer.disconnect();
      console.log('[TraceFlow Client] ✅ Kafka disconnected');
    }

    // Disconnect from Redis if we own the client
    if (this.redisClient && this.ownsRedisClient) {
      await this.redisClient.disconnect();
    }
    
    this.connected = false;
    console.log('[TraceFlow Client] ✅ TraceFlow SDK disconnected successfully');
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

    console.log(`[TraceFlow Client] Creating new trace: ${traceId} (type: ${options.trace_type || 'none'}, source: ${source || 'none'})`);

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

    // Persist initial state to Redis if available
    if (this.redisClient) {
      try {
        console.log(`[TraceFlow Client] Persisting initial trace state to Redis: ${traceId}`);
        await this.redisClient.saveTrace({
          trace_id: traceId,
          trace_type: options.trace_type,
          status: (options.status || TraceFlowTraceStatus.PENDING) as TraceFlowTraceStatus,
          source,
          created_at: now,
          updated_at: now,
          title: options.title,
          description: options.description,
          owner: options.owner,
          tags: options.tags,
          metadata: options.metadata,
          params: options.params,
          last_activity_at: now,
        });
      } catch (error) {
        console.error('[TraceFlow Client] ❌ Failed to persist initial trace state to Redis:', error);
      }
    }

    console.log(`[TraceFlow Client] ✅ Trace created successfully: ${traceId}`);
    
    // Return a TraceManager for this trace
    return new TraceManager(traceId, source, this.sendMessage.bind(this), traceOptions, this.redisClient);
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
    console.log(`[TraceFlow Client] Getting TraceManager for existing trace: ${traceId}`);
    return new TraceManager(
      traceId,
      source || this.defaultSource,
      this.sendMessage.bind(this),
      traceOptions,
      this.redisClient // Pass Redis client for state persistence
    );
  }

  /**
   * Get the Redis client (if configured)
   * Useful for querying trace/step state
   */
  getRedisClient(): TraceFlowRedisClient | undefined {
    return this.redisClient;
  }

  /**
   * Check if Redis client is configured
   */
  hasRedisClient(): boolean {
    return !!this.redisClient;
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

