/**
 * TraceFlow SDK v2 - Main SDK Class
 * Stateless, event-based tracing SDK
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

/**
 * Main SDK class - Stateless trace tracking
 */
export class TraceFlowSDK {
  private config: TraceFlowSDKConfig;
  private transport: TraceTransport;
  private contextManager: ContextManager;
  private activeTraces: Set<string> = new Set();
  private activeSteps: Set<string> = new Set();
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private exitHandlerRegistered: boolean = false;

  constructor(config: TraceFlowSDKConfig) {
    this.config = {
      silentErrors: true,
      autoFlushOnExit: true,
      flushTimeoutMs: 5000,
      maxRetries: 3,
      retryDelay: 1000,
      enableCircuitBreaker: true,
      ...config,
    };

    // Initialize context manager
    this.contextManager = new ContextManager();

    // Initialize transport
    this.transport = this.createTransport();

    // Register exit handlers
    if (this.config.autoFlushOnExit) {
      this.registerExitHandlers();
    }
  }

  /**
   * Get an existing trace by ID
   * Makes HTTP call to fetch current state from service
   */
  async getTrace(traceId: string): Promise<TraceHandle> {
    console.log(`[TraceFlow] Getting trace: ${traceId}`);

    // Only HTTP transport supports state retrieval
    if (this.config.transport !== 'http') {
      console.warn('[TraceFlow] getTrace() only supported with HTTP transport');
      // Return handle anyway (stateless mode)
      return this.createTraceHandle(traceId);
    }

    try {
      // Fetch current state from service
      const response = await fetch(
        `${this.config.endpoint}/api/v1/traces/${traceId}/state`,
        {
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Trace not found: ${traceId}`);
        }
        throw new Error(`Failed to get trace: ${response.status}`);
      }

      const state = await response.json();
      console.log(`[TraceFlow] Retrieved trace ${traceId} (status: ${state.status})`);

      // Update context with trace info
      this.contextManager.updateContext({
        trace_id: traceId,
        metadata: state.metadata,
      });

      // Return handle
      return this.createTraceHandle(traceId);
    } catch (error: any) {
      if (this.config.silentErrors) {
        console.error('[TraceFlow] Error getting trace (silenced):', error.message);
        return this.createTraceHandle(traceId);
      }
      throw error;
    }
  }

  /**
   * Get current trace from context
   */
  getCurrentTrace(): TraceHandle | null {
    const context = this.contextManager.getCurrentContext();
    
    if (!context?.trace_id) {
      return null;
    }

    return this.createTraceHandle(context.trace_id);
  }

  /**
   * Start a new trace
   * If trace_id is provided, it's idempotent (can be called multiple times)
   */
  async startTrace(options?: StartTraceOptions): Promise<TraceHandle> {
    const trace_id = options?.trace_id || uuidv4();

    // Create trace started event
    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.TRACE_STARTED,
      trace_id,
      timestamp: new Date().toISOString(),
      source: this.config.source,
      payload: {
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
    };

    // Send event
    await this.sendEvent(event);

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
      console.warn('[TraceFlow] ' + error.message);
      // Return dummy handle
      return this.createDummyStepHandle();
    }

    const step_id = options?.step_id || uuidv4();

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.STEP_STARTED,
      trace_id: context.trace_id,
      step_id,
      timestamp: new Date().toISOString(),
      source: this.config.source,
      payload: {
        name: options?.name,
        step_type: options?.step_type,
        input: options?.input,
        metadata: options?.metadata,
      },
    };

    await this.sendEvent(event);

    // Track active step
    this.activeSteps.add(step_id);

    // Update context
    this.contextManager.updateContext({ step_id });

    const handle = new StepHandleImpl(
      step_id,
      context.trace_id,
      this.config.source,
      this.sendEvent.bind(this),
      this.contextManager
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
      console.log(`[TraceFlow] ${message}`);
      return;
    }

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type: TraceEventType.LOG_EMITTED,
      trace_id: context.trace_id,
      step_id: options?.step_id || context.step_id,
      timestamp: new Date().toISOString(),
      source: this.config.source,
      payload: {
        message,
        level: options?.level || LogLevel.INFO,
        event_type: options?.event_type,
        details: options?.details,
      },
    };

    await this.sendEvent(event);
  }

  /**
   * Finish current trace (uses context)
   */
  async finishTrace(status?: 'success' | 'failed' | 'cancelled', result?: any): Promise<void> {
    const context = this.contextManager.getCurrentContext();

    if (!context?.trace_id) {
      console.warn('[TraceFlow] No active trace context');
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

    const event: TraceEvent = {
      event_id: uuidv4(),
      event_type,
      trace_id: context.trace_id,
      timestamp: new Date().toISOString(),
      source: this.config.source,
      payload: {
        result,
        error: typeof result === 'string' && status === 'failed' ? result : undefined,
      },
    };

    await this.sendEvent(event);
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
    console.log('[TraceFlow] Shutting down SDK...');

    // Close all active traces and steps
    await this.closeAllActiveTracesAndSteps();

    // Run shutdown handlers
    for (const handler of this.shutdownHandlers) {
      try {
        await handler();
      } catch (error: any) {
        console.error('[TraceFlow] Shutdown handler error:', error.message);
      }
    }

    // Shutdown transport
    if (this.transport.shutdown) {
      await this.transport.shutdown();
    }

    console.log('[TraceFlow] SDK shutdown complete');
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
      console.warn('[TraceFlow] No trace ID for heartbeat');
      return;
    }

    if (this.config.transport !== 'http') {
      console.warn('[TraceFlow] heartbeat() only supported with HTTP transport');
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
      console.log(`[TraceFlow] Heartbeat sent for trace: ${targetTraceId}`);
    } catch (error: any) {
      if (!this.config.silentErrors) {
        console.error('[TraceFlow] Heartbeat error:', error.message);
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
      this.contextManager
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
        silentErrors: this.config.silentErrors,
      });
    } else if (this.config.transport === 'kafka') {
      if (!this.config.kafka) {
        throw new Error('Kafka transport requires kafka configuration');
      }

      return new KafkaTransport({
        ...this.config.kafka,
        silentErrors: this.config.silentErrors,
      });
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
        console.error('[TraceFlow] Error sending event (silenced):', error.message);
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
        console.warn(`[TraceFlow] Auto-closing trace ${trace_id} on shutdown`);
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
        console.warn(`[TraceFlow] Auto-closing step ${step_id} on shutdown`);
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
      console.log(`[TraceFlow] Received ${signal}, cleaning up...`);

      try {
        await Promise.race([
          this.shutdown(),
          this.timeout(this.config.flushTimeoutMs!),
        ]);
      } catch (error) {
        console.error('[TraceFlow] Shutdown timeout or error:', error);
      }

      process.exit(0);
    };

    // Handle graceful shutdown signals
    process.once('SIGTERM', () => exitHandler('SIGTERM'));
    process.once('SIGINT', () => exitHandler('SIGINT'));
    
    // Best effort on uncaught errors
    process.once('uncaughtException', async (error) => {
      console.error('[TraceFlow] Uncaught exception:', error);
      await this.closeAllActiveTracesAndSteps().catch(() => {});
    });

    process.once('unhandledRejection', async (reason) => {
      console.error('[TraceFlow] Unhandled rejection:', reason);
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

