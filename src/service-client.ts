/**
 * TraceFlow Service Client
 * HTTP client for querying trace state from traceflow-service
 */

export interface TraceState {
  trace_id: string;
  trace_type?: string;
  status: string;
  source?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  last_activity_at?: string;
}

export interface StepState {
  trace_id: string;
  step_number: number;
  step_id: string;
  step_type?: string;
  name?: string;
  status: string;
  started_at: string;
  updated_at: string;
  finished_at?: string;
  last_activity_at?: string;
}

/**
 * Client for TraceFlow Service API
 */
export class TraceFlowServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Get trace state by ID
   */
  async getTrace(traceId: string): Promise<TraceState | null> {
    try {
      const response = await fetch(`${this.baseUrl}/traces/${traceId}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch trace: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching trace from service:', error);
      return null;
    }
  }

  /**
   * Get all steps for a trace
   */
  async getSteps(traceId: string): Promise<StepState[]> {
    try {
      const response = await fetch(`${this.baseUrl}/traces/${traceId}/steps`);
      
      if (response.status === 404) {
        return [];
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch steps: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching steps from service:', error);
      return [];
    }
  }

  /**
   * Get specific step by trace ID and step number
   */
  async getStep(traceId: string, stepNumber: number): Promise<StepState | null> {
    try {
      const response = await fetch(`${this.baseUrl}/traces/${traceId}/steps/${stepNumber}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch step: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching step from service:', error);
      return null;
    }
  }

  /**
   * Get the highest step number for a trace
   */
  async getLastStepNumber(traceId: string): Promise<number> {
    try {
      const steps = await this.getSteps(traceId);
      
      if (steps.length === 0) {
        return -1;
      }
      
      return Math.max(...steps.map(s => s.step_number));
    } catch (error) {
      console.error('Error getting last step number:', error);
      return -1;
    }
  }

  /**
   * Check if trace exists and is active
   */
  async isTraceActive(traceId: string): Promise<boolean> {
    const trace = await this.getTrace(traceId);
    
    if (!trace) {
      return false;
    }
    
    return ['PENDING', 'RUNNING'].includes(trace.status);
  }

  /**
   * Check if step is closed
   */
  async isStepClosed(traceId: string, stepNumber: number): Promise<boolean> {
    const step = await this.getStep(traceId, stepNumber);
    
    if (!step) {
      return false; // Step doesn't exist yet
    }
    
    return ['COMPLETED', 'FAILED'].includes(step.status);
  }
}

