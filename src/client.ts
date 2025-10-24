import { Kafka, Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import {
  KafkaConfig,
  KafkaInstanceConfig,
  TraceFlowConfig,
  CreateJobOptions,
  KafkaJobMessage,
  KafkaStepMessage,
  KafkaLogMessage,
  KafkaMessage,
  JobStatus,
} from './types';
import { JobManager } from './job-manager';

/**
 * Type guard to check if config is KafkaConfig
 */
function isKafkaConfig(config: TraceFlowConfig): config is KafkaConfig {
  return 'brokers' in config;
}

/**
 * TraceFlowClient - Main SDK client for sending job tracking messages
 */
export class TraceFlowClient {
  private kafka?: Kafka;
  private producer: Producer;
  private topic: string;
  private connected: boolean = false;
  private defaultSource?: string;
  private ownsProducer: boolean = true; // Track if we created the producer or received it

  constructor(config: TraceFlowConfig, defaultSource?: string) {
    this.topic = config.topic;
    this.defaultSource = defaultSource;

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

      this.kafka = new Kafka(kafkaConfig);
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
  }

  /**
   * Disconnect from Kafka
   * If using an external producer, this is a no-op (external code should manage disconnection)
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
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
    type: 'job' | 'step' | 'log',
    data: KafkaJobMessage | KafkaStepMessage | KafkaLogMessage
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const message: KafkaMessage = {
      type,
      data,
    };

    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: data.job_id,
          value: JSON.stringify(message),
        },
      ],
    });
  }

  /**
   * Create a new job
   * Returns a JobManager instance to manage the job
   */
  async createJob(options: CreateJobOptions = {}): Promise<JobManager> {
    const jobId = uuidv4();
    const now = new Date().toISOString();

    const source = options.source || this.defaultSource;

    const data: KafkaJobMessage = {
      job_id: jobId,
      job_type: options.job_type,
      status: options.status || JobStatus.PENDING,
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

    await this.sendMessage('job', data);

    // Return a JobManager for this job
    return new JobManager(jobId, source, this.sendMessage.bind(this));
  }

  /**
   * Get a JobManager for an existing job
   * Useful if you need to update a job from a different process/instance
   */
  getJobManager(jobId: string, source?: string): JobManager {
    return new JobManager(jobId, source || this.defaultSource, this.sendMessage.bind(this));
  }

  /**
   * Send a raw message to Kafka
   * Use this if you need more control over the message format
   */
  async sendRawMessage(
    type: 'job' | 'step' | 'log',
    data: KafkaJobMessage | KafkaStepMessage | KafkaLogMessage
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
}

