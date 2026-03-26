/**
 * Context Manager using AsyncLocalStorage
 * Tracks current trace/step context across async boundaries
 */

import { AsyncLocalStorage } from 'async_hooks';
import { TraceContext } from './types';

/**
 * Global context manager for tracking trace context
 */
export class ContextManager {
  private storage: AsyncLocalStorage<TraceContext>;

  constructor() {
    this.storage = new AsyncLocalStorage<TraceContext>();
  }

  /**
   * Get current trace context
   */
  getCurrentContext(): TraceContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Get current trace ID
   */
  getCurrentTraceId(): string | undefined {
    return this.storage.getStore()?.trace_id;
  }

  /**
   * Get current step ID
   */
  getCurrentStepId(): string | undefined {
    return this.storage.getStore()?.step_id;
  }

  /**
   * Run function with trace context
   */
  async runWithContext<T>(
    context: TraceContext,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.storage.run(context, fn);
  }

  /**
   * Set trace context for current execution
   */
  setContext(context: TraceContext): void {
    const current = this.storage.getStore();
    if (current) {
      // Merge with existing context
      Object.assign(current, context);
    }
  }

  /**
   * Update current context
   */
  updateContext(updates: Partial<TraceContext>): void {
    const current = this.storage.getStore();
    if (current) {
      Object.assign(current, updates);
    }
  }

  /**
   * Clear current context
   */
  clearContext(): void {
    this.storage.exit(() => {});
  }
}

