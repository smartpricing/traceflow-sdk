/**
 * HTTP Transport Implementation
 * Sends events to TraceFlow REST API with retry logic and circuit breaker
 */

import {
  TraceEvent,
  TraceEventType,
  TraceTransport,
  TraceStatus,
  StepStatus,
  HealthCheckResult,
  HTTPTracePayload,
  HTTPStepPayload,
  HTTPLogPayload,
} from '../types';
import { LoggerLike } from '../logger';
import { sanitizePayload } from './sanitize';

export interface HTTPTransportConfig {
  endpoint: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  silentErrors?: boolean;
}

interface QueuedRequest {
  url: string;
  method: string;
  body: any;
  retries: number;
}

/**
 * HTTP Transport with exponential backoff, circuit breaker, and batching
 */
export class HTTPTransport implements TraceTransport {
  private config: Required<HTTPTransportConfig>;
  private logger: LoggerLike;
  private queue: QueuedRequest[] = [];
  private pendingEvents: TraceEvent[] = [];
  private circuitOpen: boolean = false;
  private circuitOpenUntil: number = 0;
  private failureCount: number = 0;
  private readonly circuitThreshold: number;
  private readonly circuitTimeout: number;

  constructor(config: HTTPTransportConfig, logger?: LoggerLike) {
    this.config = {
      endpoint: config.endpoint,
      apiKey: config.apiKey || '',
      username: config.username || '',
      password: config.password || '',
      timeout: config.timeout ?? 5000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout ?? 60000,
      silentErrors: config.silentErrors ?? true,
    };

    this.circuitThreshold = this.config.circuitBreakerThreshold;
    this.circuitTimeout = this.config.circuitBreakerTimeout;
    const noop = () => {};
    this.logger = logger || { debug: noop, info: noop, warn: noop, error: noop };
  }

  /**
   * Send event to HTTP API
   */
  async send(event: TraceEvent): Promise<void> {
    try {
      // Check circuit breaker
      if (this.isCircuitOpen()) {
        this.pendingEvents.push(event);
        this.logger.warn(`Circuit open, queued event: ${event.event_type} (${this.pendingEvents.length} pending)`);
        if (!this.config.silentErrors) {
          throw new Error('Circuit breaker is open');
        }
        return;
      }

      // Convert event to HTTP payload and send
      await this.sendEventToAPI(event);
    } catch (error) {
      this.handleError(error, event);
    }
  }

  /**
   * Flush any pending events
   */
  async flush(): Promise<void> {
    // Flush pending events from circuit breaker queue
    if (this.pendingEvents.length > 0) {
      this.logger.info(`Flushing ${this.pendingEvents.length} circuit-breaker-queued events...`);
      const events = [...this.pendingEvents];
      this.pendingEvents = [];
      for (const event of events) {
        try {
          await this.sendEventToAPI(event);
        } catch (error: any) {
          if (!this.config.silentErrors) {
            this.logger.error('Failed to flush pending event:', error);
          }
        }
      }
    }

    // Flush queued requests
    if (this.queue.length === 0) {
      return;
    }

    this.logger.info(`Flushing ${this.queue.length} queued requests...`);

    const requests = [...this.queue];
    this.queue = [];

    for (const req of requests) {
      try {
        await this.executeRequest(req.url, req.method, req.body);
      } catch (error) {
        if (!this.config.silentErrors) {
          this.logger.error('Failed to flush request:', error);
        }
      }
    }
  }

  /**
   * Shutdown transport gracefully
   */
  async shutdown(): Promise<void> {
    await this.flush();
  }

  /**
   * Check connectivity to the TraceFlow backend
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['X-API-Key'] = this.config.apiKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(`${this.config.endpoint}/api/v1/health`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        const latencyMs = Date.now() - start;

        if (!response.ok) {
          return { ok: false, latencyMs, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        return { ok: true, latencyMs };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      return { ok: false, latencyMs: Date.now() - start, error: error.message };
    }
  }

  /**
   * Send event to appropriate API endpoint
   */
  private async sendEventToAPI(event: TraceEvent): Promise<void> {
    switch (event.event_type) {
      case TraceEventType.TRACE_STARTED:
        await this.createTrace(event);
        break;
      
      case TraceEventType.TRACE_FINISHED:
      case TraceEventType.TRACE_FAILED:
      case TraceEventType.TRACE_CANCELLED:
        await this.updateTrace(event);
        break;
      
      case TraceEventType.STEP_STARTED:
        await this.createStep(event);
        break;
      
      case TraceEventType.STEP_FINISHED:
      case TraceEventType.STEP_FAILED:
        await this.updateStep(event);
        break;
      
      case TraceEventType.LOG_EMITTED:
        await this.createLog(event);
        break;
      
      default:
        this.logger.warn(`Unknown event type: ${event.event_type}`);
    }
  }

  /**
   * Create trace via POST /api/v1/traces
   */
  private async createTrace(event: TraceEvent): Promise<void> {
    const payload: HTTPTracePayload = {
      trace_id: event.trace_id,
      trace_type: event.payload.trace_type,
      status: TraceStatus.PENDING,
      source: event.source,
      created_at: event.timestamp,
      updated_at: event.timestamp,
      title: event.payload.title,
      description: event.payload.description,
      owner: event.payload.owner,
      tags: event.payload.tags,
      metadata: event.payload.metadata,
      params: event.payload.params,
      last_activity_at: event.timestamp,
      idempotency_key: event.payload.idempotency_key || event.event_id,
      trace_timeout_ms: event.payload.trace_timeout_ms,
      step_timeout_ms: event.payload.step_timeout_ms,
    };

    await this.executeRequestWithRetry(
      `${this.config.endpoint}/api/v1/traces`,
      'POST',
      payload
    );
  }

  /**
   * Update trace via PATCH /api/v1/traces/{id}
   */
  private async updateTrace(event: TraceEvent): Promise<void> {
    let status: TraceStatus;
    
    switch (event.event_type) {
      case TraceEventType.TRACE_FINISHED:
        status = TraceStatus.SUCCESS;
        break;
      case TraceEventType.TRACE_FAILED:
        status = TraceStatus.FAILED;
        break;
      case TraceEventType.TRACE_CANCELLED:
        status = TraceStatus.CANCELLED;
        break;
      default:
        status = TraceStatus.RUNNING;
    }

    const payload: Partial<HTTPTracePayload> = {
      status,
      updated_at: event.timestamp,
      finished_at: event.timestamp,
      last_activity_at: event.timestamp,
      result: event.payload.result,
      error: event.payload.error,
      metadata: event.payload.metadata,
    };

    await this.executeRequestWithRetry(
      `${this.config.endpoint}/api/v1/traces/${event.trace_id}`,
      'PATCH',
      payload
    );
  }

  /**
   * Create step via POST /api/v1/steps
   */
  private async createStep(event: TraceEvent): Promise<void> {
    const payload: HTTPStepPayload = {
      trace_id: event.trace_id,
      step_id: event.step_id!,
      step_type: event.payload.step_type,
      name: event.payload.name,
      status: StepStatus.STARTED,
      started_at: event.timestamp,
      updated_at: event.timestamp,
      input: event.payload.input,
      metadata: event.payload.metadata,
    };

    await this.executeRequestWithRetry(
      `${this.config.endpoint}/api/v1/steps`,
      'POST',
      payload
    );
  }

  /**
   * Update step via PATCH /api/v1/steps/{traceId}/{stepId}
   */
  private async updateStep(event: TraceEvent): Promise<void> {
    const status = event.event_type === TraceEventType.STEP_FINISHED
      ? StepStatus.COMPLETED
      : StepStatus.FAILED;

    const payload: Partial<HTTPStepPayload> = {
      status,
      updated_at: event.timestamp,
      finished_at: event.timestamp,
      output: event.payload.output,
      error: event.payload.error,
      metadata: event.payload.metadata,
    };

    await this.executeRequestWithRetry(
      `${this.config.endpoint}/api/v1/steps/${event.trace_id}/${event.step_id}`,
      'PATCH',
      payload
    );
  }

  /**
   * Create log via POST /api/v1/logs
   */
  private async createLog(event: TraceEvent): Promise<void> {
    const payload: HTTPLogPayload = {
      trace_id: event.trace_id,
      log_time: event.timestamp,
      log_id: event.event_id,
      step_number: event.payload.step_number,
      level: event.payload.level,
      event_type: event.payload.event_type,
      message: event.payload.message,
      details: event.payload.details,
      source: event.source,
    };

    await this.executeRequestWithRetry(
      `${this.config.endpoint}/api/v1/logs`,
      'POST',
      payload
    );
  }

  /**
   * Execute HTTP request with retry logic
   */
  private async executeRequestWithRetry(
    url: string,
    method: string,
    body: any,
    retries: number = 0
  ): Promise<void> {
    try {
      await this.executeRequest(url, method, body);
      // Reset failure count on success
      this.failureCount = 0;
    } catch (error: any) {
      // Retry on network errors or 5xx status codes
      const shouldRetry = 
        retries < this.config.maxRetries &&
        (this.isNetworkError(error) || this.is5xxError(error));

      if (shouldRetry) {
        const delay = this.calculateBackoff(retries);
        this.logger.warn(`Retry ${retries + 1}/${this.config.maxRetries} after ${delay}ms`);
        
        await this.sleep(delay);
        return this.executeRequestWithRetry(url, method, body, retries + 1);
      }

      // Max retries exceeded, handle failure
      this.recordFailure();
      
      if (!this.config.silentErrors) {
        throw error;
      }
      
      this.logger.error('Request failed after retries:', error.message);
    }
  }

  /**
   * Execute single HTTP request
   */
  private async executeRequest(url: string, method: string, body: any): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication
    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    } else if (this.config.username && this.config.password) {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(sanitizePayload(body)),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(retries: number): number {
    const exponentialDelay = this.config.retryDelay * Math.pow(2, retries);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  /**
   * Check if error is a network error
   */
  private isNetworkError(error: any): boolean {
    return (
      error.name === 'AbortError' ||
      error.name === 'NetworkError' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND'
    );
  }

  /**
   * Check if error is a 5xx server error
   */
  private is5xxError(error: any): boolean {
    const message = error.message || '';
    return /HTTP 5\d{2}/.test(message);
  }

  /**
   * Record failure for circuit breaker
   */
  private recordFailure(): void {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    this.failureCount++;
    
    if (this.failureCount >= this.circuitThreshold) {
      this.circuitOpen = true;
      this.circuitOpenUntil = Date.now() + this.circuitTimeout;
      this.logger.warn(`Circuit breaker opened for ${this.circuitTimeout}ms`);
    }
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(): boolean {
    if (!this.config.enableCircuitBreaker) {
      return false;
    }

    if (this.circuitOpen && Date.now() > this.circuitOpenUntil) {
      this.logger.info('Circuit breaker closed, resuming requests');
      this.circuitOpen = false;
      this.failureCount = 0;
      this.drainPendingEvents();
    }

    return this.circuitOpen;
  }

  /**
   * Drain pending events queued during circuit break
   */
  private drainPendingEvents(): void {
    if (this.pendingEvents.length === 0) return;

    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    this.logger.info(`Draining ${events.length} pending events after circuit close`);

    // Fire-and-forget: send each event asynchronously
    for (const event of events) {
      this.sendEventToAPI(event).catch((err) => {
        this.logger.error('Failed to drain pending event:', err.message);
      });
    }
  }

  /**
   * Handle errors gracefully
   */
  private handleError(error: any, event: TraceEvent): void {
    if (this.config.silentErrors) {
      this.logger.error('Error sending event (silenced):', error.message);
    } else {
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

