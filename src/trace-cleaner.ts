import { KafkaJS } from '@confluentinc/kafka-javascript';
import { TraceFlowServiceClient } from './service-client';
import {
  TraceFlowKafkaTraceMessage,
  TraceFlowKafkaStepMessage,
  TraceFlowEventType,
  TraceFlowTraceStatus,
  TraceFlowStepStatus,
  TraceFlowKafkaLogMessage,
} from './types';


export interface TraceCleanerConfig {
  /**
   * TraceFlow service client or service URL (required)
   * Used to fetch inactive traces and steps
   */
  serviceClient: TraceFlowServiceClient | string;

  /**
   * Kafka producer instance for sending close messages
   */
  kafkaProducer: KafkaJS.Producer;

  /**
   * Kafka topic to send messages to (default: 'traceflow')
   */
  topic?: string;

  /**
   * Inactivity timeout in seconds - traces inactive longer than this will be closed
   * Default: 1800 seconds (30 minutes)
   */
  inactivityTimeoutSeconds?: number;

  /**
   * Cron interval in seconds - how often to run the cleanup traces
   * The cleaner will fetch traces that were last updated in this interval
   * Default: 300 seconds (5 minutes)
   */
  cleanupIntervalSeconds?: number;

  /**
   * Whether to automatically start the cleaner when instantiated
   * Default: false
   */
  autoStart?: boolean;

  /**
   * Custom logger function (optional)
   */
  logger?: (message: string, data?: any) => void;
}

export interface InactiveTrace {
  trace_id: string;
  trace_name: string;
  updated_at: string;
  metadata?: any;
}

export interface InactiveStep {
  trace_id: string;
  step_number: number;
  step_name: string;
  status: string;
  updated_at: string;
}

export class TraceCleaner {
  private serviceClient: TraceFlowServiceClient;
  private kafkaProducer: KafkaJS.Producer;
  private topic: string;
  private inactivityTimeoutSeconds: number;
  private cleanupIntervalSeconds: number;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private logger: (message: string, data?: any) => void;

  constructor(config: TraceCleanerConfig) {
    // Initialize service client
    if (typeof config.serviceClient === 'string') {
      this.serviceClient = new TraceFlowServiceClient(config.serviceClient);
    } else {
      this.serviceClient = config.serviceClient;
    }

    this.kafkaProducer = config.kafkaProducer;
    this.topic = config.topic || 'traceflow';
    this.inactivityTimeoutSeconds = config.inactivityTimeoutSeconds || 1800; // 30 minutes
    this.cleanupIntervalSeconds = config.cleanupIntervalSeconds || 300; // 5 minutes
    this.logger = config.logger || ((msg, data) => console.log(msg, data || ''));

    if (config.autoStart) {
      this.start();
    }
  }

  /**
   * Start the cleanup job
   */
  public start(): void {
    if (this.isRunning) {
      this.logger('⚠️  TraceCleaner is already running');
      return;
    }

    this.logger('🚀 Starting TraceCleaner', {
      inactivityTimeout: `${this.inactivityTimeoutSeconds} seconds (${Math.floor(this.inactivityTimeoutSeconds / 60)} minutes)`,
      cleanupInterval: `${this.cleanupIntervalSeconds} seconds (${Math.floor(this.cleanupIntervalSeconds / 60)} minutes)`,
      topic: this.topic,
    });

    // Run immediately on start
    this.cleanup().catch((error) => {
      this.logger('❌ Error during initial cleanup:', error);
    });

    // Schedule periodic cleanup
    const intervalMs = this.cleanupIntervalSeconds * 1000;
    this.intervalId = setInterval(() => {
      this.cleanup().catch((error) => {
        this.logger('❌ Error during cleanup:', error);
      });
    }, intervalMs);

    this.isRunning = true;
  }

  /**
   * Stop the cleanup job
   */
  public stop(): void {
    if (!this.isRunning) {
      this.logger('⚠️  TraceCleaner is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    this.logger('🛑 TraceCleaner stopped');
  }

  /**
   * Check if the cleaner is currently running
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Manually trigger a cleanup run
   */
  public async runCleanup(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Main cleanup logic
   */
  private async cleanup(): Promise<void> {
    const startTime = Date.now();
    this.logger('🧹 Running trace cleanup job...');

    try {
      // Fetch inactive traces from the service
      const inactiveTraces = await this.fetchInactiveTraces();

      if (inactiveTraces.length === 0) {
        this.logger('✅ No inactive traces found');
        return;
      }

      this.logger(`📊 Found ${inactiveTraces.length} inactive traces to close`);

      const results = await Promise.allSettled(
        inactiveTraces.map((trace) => this.closeInactiveTrace(trace))
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      const duration = Date.now() - startTime;
      this.logger('✅ Cleanup completed', {
        duration: `${duration}ms`,
        total: inactiveTraces.length,
        successful,
        failed,
      });
    } catch (error) {
      this.logger('❌ Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Fetch inactive traces from the TraceFlow service
   */
  private async fetchInactiveTraces(): Promise<InactiveTrace[]> {
    try {
      const response = await fetch(
        `${this.serviceClient['baseUrl']}/api/traces/inactive?seconds=${this.inactivityTimeoutSeconds}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch inactive traces: ${response.statusText}`);
      }

      const data = await response.json();
      return data.traces || [];
    } catch (error) {
      this.logger('❌ Error fetching inactive traces:', error);
      throw error;
    }
  }

  /**
   * Fetch open steps for a trace from the TraceFlow service
   */
  private async fetchOpenSteps(traceId: string): Promise<InactiveStep[]> {
    try {
      const response = await fetch(
        `${this.serviceClient['baseUrl']}/api/traces/${traceId}/steps/inactive?seconds=${this.inactivityTimeoutSeconds}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch open steps: ${response.statusText}`);
      }

      const data = await response.json();
      return data.steps || [];
    } catch (error) {
      this.logger(`❌ Error fetching open steps for trace ${traceId}:`, error);
      return [];
    }
  }

  /**
   * Close an inactive trace and all its pending steps
   */
  private async closeInactiveTrace(trace: InactiveTrace): Promise<void> {
    const traceId = trace.trace_id;
    const now = new Date();

    this.logger(`🔒 Closing inactive trace: ${traceId}`);

    try {
      // 1. Fetch all open steps for this trace from the service
      const openSteps = await this.fetchOpenSteps(traceId);

      // 2. Close all open steps via Kafka
      for (const step of openSteps) {
        await this.closeStep(traceId, step, now);
      }

      // 3. Close the trace itself via Kafka
      await this.closeTrace(traceId, trace, now);

      this.logger(
        `✅ Successfully closed trace ${traceId} with ${openSteps.length} steps`
      );
    } catch (error) {
      this.logger(`❌ Error closing trace ${traceId}:`, error);
      throw error;
    }
  }

  /**
   * Close a step by sending Kafka message
   */
  private async closeStep(
    traceId: string,
    step: InactiveStep,
    now: Date
  ): Promise<void> {
    const stepNumber = step.step_number;

    // Send Kafka message to update the step
    const stepMessage: TraceFlowKafkaStepMessage = {
      trace_id: traceId,
      step_number: stepNumber,
      status: TraceFlowStepStatus.FAILED,
      finished_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    await this.kafkaProducer.send({
      topic: this.topic,
      messages: [
        {
          key: traceId,
          value: JSON.stringify({ type: 'step', data: stepMessage }),
        },
      ],
    });

    // Send log message
    await this.createLog(
      traceId,
      stepNumber,
      'error',
      'Step automatically closed due to trace inactivity'
    );
  }

  /**
   * Close a trace by sending Kafka message
   */
  private async closeTrace(
    traceId: string,
    trace: InactiveTrace,
    now: Date
  ): Promise<void> {
    // Send Kafka message to update the trace
    const traceMessage: TraceFlowKafkaTraceMessage = {
      trace_id: traceId,
      status: TraceFlowTraceStatus.FAILED,
      finished_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    await this.kafkaProducer.send({
      topic: this.topic,
      messages: [
        {
          key: traceId,
          value: JSON.stringify({ type: 'trace', data: traceMessage }),
        },
      ],
    });

    // Send log message
    await this.createLog(
      traceId,
      null,
      'warn',
      `Trace automatically closed due to inactivity (timeout: ${this.inactivityTimeoutSeconds} seconds)`
    );
  }

  /**
   * Create a log entry via Kafka
   */
  private async createLog(
    traceId: string,
    stepNumber: number | null,
    level: string,
    message: string
  ): Promise<void> {
    const now = new Date();

    const logMessage: TraceFlowKafkaLogMessage = {
      trace_id: traceId,
      log_time: now.toISOString(),
      step_number: stepNumber || undefined,
      level,
      event_type: 'message',
      message,
      details: undefined,
      source: undefined,
    };

    await this.kafkaProducer.send({
      topic: this.topic,
      messages: [
        {
          key: traceId,
          value: JSON.stringify({ type: 'log', data: logMessage }),
        },
      ],
    });
  }
}
