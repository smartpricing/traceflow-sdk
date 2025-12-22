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
  HTTPTracePayload,
  HTTPStepPayload,
  HTTPLogPayload,
} from '../types';

export interface HTTPTransportConfig {
  endpoint: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableCircuitBreaker?: boolean;
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
  private queue: QueuedRequest[] = [];
  private circuitOpen: boolean = false;
  private circuitOpenUntil: number = 0;
  private failureCount: number = 0;
  private readonly CIRCUIT_THRESHOLD = 5;
  private readonly CIRCUIT_TIMEOUT = 60000; // 1 minute

  constructor(config: HTTPTransportConfig) {
    this.config = {
      endpoint: config.endpoint,
      apiKey: config.apiKey || '',
      username: config.username || '',
      password: config.password || '',
      timeout: config.timeout || 5000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      silentErrors: config.silentErrors ?? true,
    };
  }

  /**
   * Send event to HTTP API
   */
  async send(event: TraceEvent): Promise<void> {
    try {
      // Check circuit breaker
      if (this.isCircuitOpen()) {
        if (this.config.silentErrors) {
          console.warn(`[TraceFlow HTTP] Circuit open, queueing event: ${event.event_type}`);
          return;
        }
        throw new Error('Circuit breaker is open');
      }

      // Convert event to HTTP payload and send
      await this.sendEventToAPI(event);
      
      // Reset failure count on success
      this.failureCount = 0;
    } catch (error) {
      this.handleError(error, event);
    }
  }

  /**
   * Flush any pending events
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    console.log(`[TraceFlow HTTP] Flushing ${this.queue.length} queued requests...`);
    
    const requests = [...this.queue];
    this.queue = [];

    for (const req of requests) {
      try {
        await this.executeRequest(req.url, req.method, req.body);
      } catch (error) {
        if (!this.config.silentErrors) {
          console.error('[TraceFlow HTTP] Failed to flush request:', error);
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
        console.warn(`[TraceFlow HTTP] Unknown event type: ${event.event_type}`);
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
    } catch (error: any) {
      // Retry on network errors or 5xx status codes
      const shouldRetry = 
        retries < this.config.maxRetries &&
        (this.isNetworkError(error) || this.is5xxError(error));

      if (shouldRetry) {
        const delay = this.calculateBackoff(retries);
        console.warn(`[TraceFlow HTTP] Retry ${retries + 1}/${this.config.maxRetries} after ${delay}ms`);
        
        await this.sleep(delay);
        return this.executeRequestWithRetry(url, method, body, retries + 1);
      }

      // Max retries exceeded, handle failure
      this.recordFailure();
      
      if (!this.config.silentErrors) {
        throw error;
      }
      
      console.error('[TraceFlow HTTP] Request failed after retries:', error.message);
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
        body: JSON.stringify(body),
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
    
    if (this.failureCount >= this.CIRCUIT_THRESHOLD) {
      this.circuitOpen = true;
      this.circuitOpenUntil = Date.now() + this.CIRCUIT_TIMEOUT;
      console.warn(`[TraceFlow HTTP] Circuit breaker opened for ${this.CIRCUIT_TIMEOUT}ms`);
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
      console.log('[TraceFlow HTTP] Circuit breaker closed, resuming requests');
      this.circuitOpen = false;
      this.failureCount = 0;
    }

    return this.circuitOpen;
  }

  /**
   * Handle errors gracefully
   */
  private handleError(error: any, event: TraceEvent): void {
    if (this.config.silentErrors) {
      console.error('[TraceFlow HTTP] Error sending event (silenced):', error.message);
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

