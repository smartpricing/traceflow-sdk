/**
 * TraceFlow SDK v2 - Main SDK Class
 * Stateless, event-based tracing SDK for distributed systems
 * 
 * @example
 * ```typescript
 * const sdk = new TraceFlowSDK({
 *   transport: 'http',
 *   source: 'my-service',
 *   endpoint: 'http://localhost:3009',
 *   enableLogging: true,
 *   logLevel: 'info'
 * });
 * 
 * const trace = await sdk.startTrace({ title: 'My Process' });
 * const step = await trace.startStep({ name: 'Step 1' });
 * await step.finish({ output: 'done' });
 * await trace.finish({ result: 'success' });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import {
  TraceFlowSDKConfig,
  TraceTransport,
  TraceEvent,
  TraceEventType,
  TraceHandle,
  StepHandle,
  StartTraceOptions,
  StartStepOptions,
  LogOptions,
  LogLevel,
} from './types';
import { ContextManager } from './context-manager';
import { TraceHandleImpl, StepHandleImpl } from './handles';
import { HTTPTransport } from './transports/http-transport';
import { KafkaTransport } from './transports/kafka-transport';
import { Logger } from './logger';
import { createTraceEvent } from './event-factory';

/**
 * Main SDK class for TraceFlow distributed tracing
 * 
 * The SDK provides a stateless, event-based architecture for tracking
 * traces and steps across distributed systems. It supports both HTTP
 * and Kafka transports for maximum flexibility.
 * 
 * @remarks
 * The SDK never throws exceptions (when silentErrors: true), making it
 * safe to use in production without impacting your application's stability.
 * 
 * @public
 */
export class TraceFlowSDK {
  private config: TraceFlowSDKConfig;
  private transport: TraceTransport;
  private contextManager: ContextManager;
  private logger: Logger;
  private activeTraces: Set<string> = new Set();
  private activeSteps: Set<string> = new Set();
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private exitHandlerRegistered: boolean = false;

  /**
   * Creates a new TraceFlow SDK instance
   * 
   * @param config - SDK configuration options
   * 
   * @example
   * ```typescript
   * // HTTP Transport
   * const sdk = new TraceFlowSDK({
   *   transport: 'http',
   *   source: 'my-service',
   *   endpoint: 'http://localhost:3009',
   *   apiKey: 'your-api-key'
   * });
   * 
   * // Kafka Transport
   * const sdk = new TraceFlowSDK({
   *   transport: 'kafka',
   *   source: 'my-service',
   *   kafka: {
   *     brokers: ['localhost:9092'],
   *     topic: 'traceflow-events'
   *   }
   * });
   * ```
   */
  constructor(config: TraceFlowSDKConfig) {
    this.config = {
      silentErrors: true,
      autoFlushOnExit: true,
      flushTimeoutMs: 5000,
      maxRetries: 3,
      retryDelay: 1000,
      enableCircuitBreaker: true,
      enableLogging: true,
      logLevel: 'info',
      ...config,
    };

    // Initialize logger
    this.logger = new Logger({
      enabled: this.config.enableLogging,
      minLevel: this.config.logLevel,
      customLogger: this.config.logger,
    });

    this.logger.info('Initializing TraceFlow SDK', {
      transport: this.config.transport,
      source: this.config.source,
      silentErrors: this.config.silentErrors,
      autoFlushOnExit: this.config.autoFlushOnExit,
    });

    // Initialize context manager
    this.contextManager = new ContextManager();
    this.logger.debug('Context manager initialized');

    // Initialize transport
    this.transport = this.createTransport();

    // Register exit handlers
    if (this.config.autoFlushOnExit) {
      this.registerExitHandlers();
    }
  }

  /**
   * Retrieve an existing trace by ID from the service
   * 
   * Makes an HTTP call to fetch the current state of a trace from the TraceFlow service.
   * This is useful for continuing a trace across different services or execution contexts.
   * 
   * @param traceId - The unique identifier of the trace to retrieve
   * @returns A TraceHandle for interacting with the trace
   * 
   * @remarks
   * - Only works with HTTP transport
   * - Updates internal context with the retrieved trace info
   * - In silent mode, returns a handle even if the trace doesn't exist
   * 
   * @example
   * ```typescript
   * // Service B continues a trace started by Service A
   * const traceId = request.headers['x-trace-id'];
   * const trace = await sdk.getTrace(traceId);
   * await trace.startStep({ name: 'Service B Processing' });
   * ```
   */
  async getTrace(traceId: string): Promise<TraceHandle> {
    this.logger.info(`Getting trace: ${traceId}`);

    // Only HTTP transport supports state retrieval
    if (this.config.transport !== 'http') {
      this.logger.warn('getTrace() only supported with HTTP transport, returning stateless handle');
      return this.createTraceHandle(traceId);
    }

    try {
      this.logger.debug(`Fetching trace state from service: ${traceId}`);
      
      // Fetch current state from service
      const response = await fetch(
        `${this.config.endpoint}/api/v1/traces/${traceId}/state`,
        {
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn(`Trace not found: ${traceId}`);
          throw new Error(`Trace not found: ${traceId}`);
        }
        this.logger.error(`Failed to get trace: HTTP ${response.status}`);
        throw new Error(`Failed to get trace: ${response.status}`);
      }

      const state = await response.json();
      this.logger.info(`Retrieved trace ${traceId}`, { status: state.status });
      this.logger.debug(`Trace state:`, state);

      // Update context with trace info
      this.contextManager.updateContext({
        trace_id: traceId,
        metadata: state.metadata,
      });

      // Return handle
      return this.createTraceHandle(traceId);
    } catch (error: any) {
      if (this.config.silentErrors) {
        this.logger.error(`Error getting trace (silenced): ${error.message}`);
        return this.createTraceHandle(traceId);
      }
      throw error;
    }
  }

  /**
   * Get the current active trace from context
   * 
   * Returns the trace handle for the currently active trace in the execution context.
   * Uses AsyncLocalStorage to maintain context across async operations.
   * 
   * @returns The current TraceHandle or null if no trace is active
   * 
   * @remarks
   * - Does not make any HTTP calls
   * - Returns immediately from local context
   * - Useful for accessing trace in nested function calls
   * 
   * @example
   * ```typescript
   * await sdk.startTrace({ title: 'My Process' });
   * 
   * // Later in a nested function...
   * async function processData() {
   *   const trace = sdk.getCurrentTrace();
   *   if (trace) {
   *     await trace.log('Processing data...');
   *   }
   * }
   * ```
   */
  getCurrentTrace(): TraceHandle | null {
    const context = this.contextManager.getCurrentContext();
    
    if (!context?.trace_id) {
      this.logger.debug('No active trace in context');
      return null;
    }

    this.logger.debug(`Found active trace in context: ${context.trace_id}`);
    return this.createTraceHandle(context.trace_id);
  }

  /**
   * Start a new trace
   * If trace_id is provided, it's idempotent (can be called multiple times)
   */
  async startTrace(options?: StartTraceOptions): Promise<TraceHandle> {
    const trace_id = options?.trace_id || uuidv4();

    // Send trace started event
    await this.sendEvent(createTraceEvent(
      TraceEventType.TRACE_STARTED,
      trace_id,
      this.config.source,
      {
        trace_type: options?.trace_type,
        title: options?.title,
        description: options?.description,
        owner: options?.owner,
        tags: options?.tags,
        metadata: options?.metadata,
        params: options?.params,
        idempotency_key: options?.idempotency_key,
        trace_timeout_ms: options?.trace_timeout_ms,
        step_timeout_ms: options?.step_timeout_ms,
      },
    ));

    // Create and return handle
    return this.createTraceHandle(trace_id);
  }

  /**
   * Run function with trace context
   * Automatically starts and finishes trace
   */
  async runWithTrace<T>(
    options: StartTraceOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    const trace = await this.startTrace(options);

    try {
      // Run function with trace context
      const result = await this.contextManager.runWithContext(
        {
          trace_id: trace.trace_id,
          metadata: options.metadata,
        },
        fn
      );

      // Finish trace successfully
      await trace.finish({ result });

      return result;
    } catch (error: any) {
      // Fail trace on error
      await trace.fail(error);
      throw error;
    }
  }

  /**
   * Start a step (uses current trace context if available)
   */
  async startStep(options?: StartStepOptions): Promise<StepHandle> {
    const context = this.contextManager.getCurrentContext();
    
    if (!context?.trace_id) {
      const error = new Error('No active trace context. Start a trace first or use runWithTrace()');
      if (!this.config.silentErrors) {
        throw error;
      }
      this.logger.warn(error.message);
      // Return dummy handle
      return this.createDummyStepHandle();
    }

    const step_id = options?.step_id || uuidv4();

    await this.sendEvent(createTraceEvent(
      TraceEventType.STEP_STARTED,
      context.trace_id,
      this.config.source,
      {
        name: options?.name,
        step_type: options?.step_type,
        input: options?.input,
        metadata: options?.metadata,
      },
      step_id,
    ));

    // Track active step
    this.activeSteps.add(step_id);

    // Update context
    this.contextManager.updateContext({ step_id });

    const handle = new StepHandleImpl(
      step_id,
      context.trace_id,
      this.config.source,
      this.sendEvent.bind(this),
      this.contextManager,
      this.logger
    );

    // Auto-close on handle finalization
    this.registerStepCleanup(step_id, handle);

    return handle;
  }

  /**
   * Log message (uses current trace/step context if available)
   */
  async log(message: string, options?: LogOptions): Promise<void> {
    const context = this.contextManager.getCurrentContext();

    if (!context?.trace_id) {
      // No context, just log to console
      this.logger.info(message);
      return;
    }

    await this.sendEvent(createTraceEvent(
      TraceEventType.LOG_EMITTED,
      context.trace_id,
      this.config.source,
      {
        message,
        level: options?.level || LogLevel.INFO,
        event_type: options?.event_type,
        details: options?.details,
      },
      options?.step_id || context.step_id,
    ));
  }

  /**
   * Finish current trace (uses context)
   */
  async finishTrace(status?: 'success' | 'failed' | 'cancelled', result?: any): Promise<void> {
    const context = this.contextManager.getCurrentContext();

    if (!context?.trace_id) {
      this.logger.warn('No active trace context');
      return;
    }

    let event_type: TraceEventType;
    switch (status) {
      case 'failed':
        event_type = TraceEventType.TRACE_FAILED;
        break;
      case 'cancelled':
        event_type = TraceEventType.TRACE_CANCELLED;
        break;
      default:
        event_type = TraceEventType.TRACE_FINISHED;
    }

    await this.sendEvent(createTraceEvent(
      event_type,
      context.trace_id,
      this.config.source,
      {
        result,
        error: typeof result === 'string' && status === 'failed' ? result : undefined,
      },
    ));
    this.activeTraces.delete(context.trace_id);
  }

  /**
   * Fail current trace (uses context)
   */
  async failTrace(error: string | Error): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    await this.finishTrace('failed', errorMessage);
  }

  /**
   * Check connectivity to the TraceFlow backend
   * Only works with HTTP transport
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    if (!this.transport.healthCheck) {
      return { ok: false, latencyMs: 0, error: 'Health check only supported with HTTP transport' };
    }
    return this.transport.healthCheck();
  }

  /**
   * Flush all pending events
   */
  async flush(): Promise<void> {
    if (this.transport.flush) {
      await this.transport.flush();
    }
  }

  /**
   * Shutdown SDK gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down SDK...');

    // Close all active traces and steps
    await this.closeAllActiveTracesAndSteps();

    // Run shutdown handlers
    for (const handler of this.shutdownHandlers) {
      try {
        await handler();
      } catch (error: any) {
        this.logger.error('Shutdown handler error:', error.message);
      }
    }

    // Shutdown transport
    if (this.transport.shutdown) {
      await this.transport.shutdown();
    }

    this.logger.info('SDK shutdown complete');
  }

  /**
   * Get current trace context
   */
  getCurrentContext() {
    return this.contextManager.getCurrentContext();
  }

  /**
   * Send heartbeat for a trace (updates last_activity_at)
   * Only works with HTTP transport
   */
  async heartbeat(traceId?: string): Promise<void> {
    const targetTraceId = traceId || this.contextManager.getCurrentTraceId();

    if (!targetTraceId) {
      this.logger.warn('No trace ID for heartbeat');
      return;
    }

    if (this.config.transport !== 'http') {
      this.logger.warn('heartbeat() only supported with HTTP transport');
      return;
    }

    try {
      await fetch(
        `${this.config.endpoint}/api/v1/traces/${targetTraceId}/heartbeat`,
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
        }
      );
      this.logger.debug(`Heartbeat sent for trace: ${targetTraceId}`);
    } catch (error: any) {
      if (!this.config.silentErrors) {
        this.logger.error('Heartbeat error:', error.message);
      }
    }
  }

  /**
   * Create trace handle
   */
  private createTraceHandle(traceId: string): TraceHandle {
    const handle = new TraceHandleImpl(
      traceId,
      this.config.source,
      this.sendEvent.bind(this),
      this.contextManager,
      this.logger
    );

    // Track for cleanup
    this.activeTraces.add(traceId);
    this.registerTraceCleanup(traceId, handle);

    return handle;
  }

  /**
   * Get authentication headers for HTTP requests
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    } else if (this.config.username && this.config.password) {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    return headers;
  }

  /**
   * Create transport based on config
   */
  private createTransport(): TraceTransport {
    if (this.config.transport === 'http') {
      if (!this.config.endpoint) {
        throw new Error('HTTP transport requires endpoint configuration');
      }

      return new HTTPTransport({
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
        username: this.config.username,
        password: this.config.password,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        retryDelay: this.config.retryDelay,
        enableCircuitBreaker: this.config.enableCircuitBreaker,
        circuitBreakerThreshold: this.config.circuitBreakerThreshold,
        circuitBreakerTimeout: this.config.circuitBreakerTimeout,
        silentErrors: this.config.silentErrors,
      }, this.logger.scope('HTTP'));
    } else if (this.config.transport === 'kafka') {
      if (!this.config.kafka) {
        throw new Error('Kafka transport requires kafka configuration');
      }

      return new KafkaTransport({
        ...this.config.kafka,
        silentErrors: this.config.silentErrors,
      }, undefined, this.logger.scope('Kafka'));
    } else {
      throw new Error(`Unknown transport: ${this.config.transport}`);
    }
  }

  /**
   * Send event through transport with error handling
   */
  private async sendEvent(event: TraceEvent): Promise<void> {
    try {
      await this.transport.send(event);
    } catch (error: any) {
      if (this.config.silentErrors) {
        this.logger.error('Error sending event (silenced):', error.message);
      } else {
        throw error;
      }
    }
  }

  /**
   * Register trace cleanup on process exit
   */
  private registerTraceCleanup(trace_id: string, handle: TraceHandle): void {
    const cleanup = async () => {
      if (this.activeTraces.has(trace_id)) {
        this.logger.warn(`Auto-closing trace ${trace_id} on shutdown`);
        await handle.fail(new Error('Process terminated'));
        this.activeTraces.delete(trace_id);
      }
    };

    this.shutdownHandlers.push(cleanup);
  }

  /**
   * Register step cleanup on process exit
   */
  private registerStepCleanup(step_id: string, handle: StepHandle): void {
    const cleanup = async () => {
      if (this.activeSteps.has(step_id)) {
        this.logger.warn(`Auto-closing step ${step_id} on shutdown`);
        await handle.fail(new Error('Process terminated'));
        this.activeSteps.delete(step_id);
      }
    };

    this.shutdownHandlers.push(cleanup);
  }

  /**
   * Close all active traces and steps
   */
  private async closeAllActiveTracesAndSteps(): Promise<void> {
    // Run all shutdown handlers
    for (const handler of this.shutdownHandlers) {
      try {
        await handler();
      } catch (error) {
        // Silent errors during shutdown
      }
    }

    this.activeTraces.clear();
    this.activeSteps.clear();
    this.shutdownHandlers = [];
  }

  /**
   * Register process exit handlers
   */
  private registerExitHandlers(): void {
    if (this.exitHandlerRegistered) {
      return;
    }

    const exitHandler = async (signal: string) => {
      this.logger.info(`Received ${signal}, cleaning up...`);

      try {
        await Promise.race([
          this.shutdown(),
          this.timeout(this.config.flushTimeoutMs!),
        ]);
      } catch (error) {
        this.logger.error('Shutdown timeout or error:', error);
      }

      process.exit(0);
    };

    // Handle graceful shutdown signals
    process.once('SIGTERM', () => exitHandler('SIGTERM'));
    process.once('SIGINT', () => exitHandler('SIGINT'));
    
    // Best effort on uncaught errors
    process.once('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception:', error);
      await this.closeAllActiveTracesAndSteps().catch(() => {});
    });

    process.once('unhandledRejection', async (reason) => {
      this.logger.error('Unhandled rejection:', reason);
      await this.closeAllActiveTracesAndSteps().catch(() => {});
    });

    this.exitHandlerRegistered = true;
  }

  /**
   * Create dummy step handle (when no context available)
   */
  private createDummyStepHandle(): StepHandle {
    return {
      step_id: 'dummy',
      trace_id: 'dummy',
      finish: async () => {},
      fail: async () => {},
      log: async () => {},
    };
  }

  /**
   * Timeout utility
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    );
  }
}

