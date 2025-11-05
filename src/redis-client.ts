/**
 * Redis Client for TraceFlow State Management
 * Handles persistence of trace and step state to prevent data loss on pod restarts
 */

import { createClient, RedisClientType } from 'redis';
import { TraceFlowTraceStatus, TraceFlowStepStatus } from './types';

export interface TraceState {
  trace_id: string;
  trace_type?: string;
  status: TraceFlowTraceStatus;
  source?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  params?: any;
  result?: any;
  error?: string;
  last_activity_at: string;
}

export interface StepState {
  trace_id: string;
  step_number: number;
  step_id: string;
  step_type?: string;
  name?: string;
  status: TraceFlowStepStatus;
  started_at: string;
  updated_at: string;
  finished_at?: string;
  input?: any;
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
  last_activity_at: string;
}

/**
 * Redis client for managing trace state
 */
export class TraceFlowRedisClient {
  private client: RedisClientType;
  private connected: boolean = false;
  private preventDuplicates: boolean = false;

  constructor(client: RedisClientType, preventDuplicates: boolean = false) {
    this.client = client;
    this.preventDuplicates = preventDuplicates;
    console.log(`[TraceFlow Redis] Duplicate prevention: ${preventDuplicates ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (!this.connected) {
      console.log('[TraceFlow Redis] Connecting to Redis...');
      await this.client.connect();
      this.connected = true;
      console.log('[TraceFlow Redis] ✅ Connected to Redis successfully');
    } else {
      console.log('[TraceFlow Redis] Already connected to Redis');
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      console.log('[TraceFlow Redis] Disconnecting from Redis...');
      await this.client.disconnect();
      this.connected = false;
      console.log('[TraceFlow Redis] ✅ Disconnected from Redis');
    } else {
      console.log('[TraceFlow Redis] Already disconnected from Redis');
    }
  }

  /**
   * Save trace state
   * @throws {DuplicateError} If preventDuplicates is enabled and trace already exists with status PENDING or RUNNING
   */
  async saveTrace(state: TraceState): Promise<void> {
    const key = `trace:${state.trace_id}`;
    console.log(`[TraceFlow Redis] Saving trace state: ${state.trace_id} (status: ${state.status})`);
    
    // Check for duplicates if preventDuplicates is enabled
    if (this.preventDuplicates) {
      const existing = await this.getTrace(state.trace_id);
      if (existing) {
        // Allow updates to existing trace, but check if it's already closed
        const closedStatuses = [TraceFlowTraceStatus.SUCCESS, TraceFlowTraceStatus.FAILED, TraceFlowTraceStatus.CANCELLED];
        if (closedStatuses.includes(existing.status)) {
          console.log(`[TraceFlow Redis] ⚠️ Duplicate prevention: Trace ${state.trace_id} already closed with status ${existing.status}`);
          const { DuplicateError } = require('./errors');
          throw new DuplicateError('trace', state.trace_id);
        }
        console.log(`[TraceFlow Redis] Updating existing trace: ${state.trace_id} (current status: ${existing.status} -> new status: ${state.status})`);
      }
    }
    
    const data: Record<string, string> = {
      trace_id: state.trace_id,
      status: state.status,
      created_at: state.created_at,
      updated_at: state.updated_at,
      last_activity_at: state.last_activity_at,
    };

    if (state.trace_type) data.trace_type = state.trace_type;
    if (state.source) data.source = state.source;
    if (state.started_at) data.started_at = state.started_at;
    if (state.finished_at) data.finished_at = state.finished_at;
    if (state.title) data.title = state.title;
    if (state.description) data.description = state.description;
    if (state.owner) data.owner = state.owner;
    if (state.tags) data.tags = JSON.stringify(state.tags);
    if (state.metadata) data.metadata = JSON.stringify(state.metadata);
    if (state.params) data.params = JSON.stringify(state.params);
    if (state.result) data.result = JSON.stringify(state.result);
    if (state.error) data.error = state.error;

    await this.client.hSet(key, data);
    
    // Add to activity sorted set for cleanup queries
    const timestamp = new Date(state.last_activity_at).getTime();
    await this.client.zAdd('traces:activity', {
      score: timestamp,
      value: state.trace_id,
    });
    
    console.log(`[TraceFlow Redis] ✅ Trace state saved: ${state.trace_id}`);
  }

  /**
   * Get trace state
   */
  async getTrace(traceId: string): Promise<TraceState | null> {
    const key = `trace:${traceId}`;
    console.log(`[TraceFlow Redis] Retrieving trace state: ${traceId}`);
    
    const data = await this.client.hGetAll(key);
    
    if (!data || Object.keys(data).length === 0) {
      console.log(`[TraceFlow Redis] ⚠️ Trace not found in Redis: ${traceId}`);
      return null;
    }

    console.log(`[TraceFlow Redis] ✅ Trace retrieved: ${traceId} (status: ${data.status})`);
    
    return {
      trace_id: data.trace_id,
      trace_type: data.trace_type,
      status: data.status as TraceFlowTraceStatus,
      source: data.source,
      created_at: data.created_at,
      updated_at: data.updated_at,
      started_at: data.started_at,
      finished_at: data.finished_at,
      title: data.title,
      description: data.description,
      owner: data.owner,
      tags: data.tags ? JSON.parse(data.tags) : undefined,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
      params: data.params ? JSON.parse(data.params) : undefined,
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error,
      last_activity_at: data.last_activity_at,
    };
  }

  /**
   * Delete trace state
   */
  async deleteTrace(traceId: string): Promise<void> {
    const key = `trace:${traceId}`;
    await this.client.del(key);
    await this.client.zRem('traces:activity', traceId);
  }

  /**
   * Save step state
   * @throws {DuplicateError} If preventDuplicates is enabled and step already exists with COMPLETED or FAILED status
   */
  async saveStep(state: StepState): Promise<void> {
    const key = `trace:${state.trace_id}:step:${state.step_number}`;
    console.log(`[TraceFlow Redis] Saving step state: ${state.trace_id}:${state.step_number} (status: ${state.status})`);
    
    // Check for duplicates if preventDuplicates is enabled
    if (this.preventDuplicates) {
      const existing = await this.getStep(state.trace_id, state.step_number);
      if (existing) {
        // Allow updates to existing step, but check if it's already closed
        const closedStatuses = [TraceFlowStepStatus.COMPLETED, TraceFlowStepStatus.FAILED];
        if (closedStatuses.includes(existing.status)) {
          console.log(`[TraceFlow Redis] ⚠️ Duplicate prevention: Step ${state.trace_id}:${state.step_number} already closed with status ${existing.status}`);
          const { DuplicateError } = require('./errors');
          throw new DuplicateError('step', `${state.trace_id}:${state.step_number}`);
        }
        console.log(`[TraceFlow Redis] Updating existing step: ${state.trace_id}:${state.step_number} (current status: ${existing.status} -> new status: ${state.status})`);
      }
    }
    
    const data: Record<string, string> = {
      trace_id: state.trace_id,
      step_number: state.step_number.toString(),
      step_id: state.step_id,
      status: state.status,
      started_at: state.started_at,
      updated_at: state.updated_at,
      last_activity_at: state.last_activity_at,
    };

    if (state.step_type) data.step_type = state.step_type;
    if (state.name) data.name = state.name;
    if (state.finished_at) data.finished_at = state.finished_at;
    if (state.input) data.input = JSON.stringify(state.input);
    if (state.output) data.output = JSON.stringify(state.output);
    if (state.error) data.error = state.error;
    if (state.metadata) data.metadata = JSON.stringify(state.metadata);

    await this.client.hSet(key, data);
    
    // Add to step activity sorted set for cleanup queries
    const timestamp = new Date(state.last_activity_at).getTime();
    await this.client.zAdd(`trace:${state.trace_id}:steps:activity`, {
      score: timestamp,
      value: state.step_number.toString(),
    });
    
    console.log(`[TraceFlow Redis] ✅ Step state saved: ${state.trace_id}:${state.step_number}`);
  }

  /**
   * Get step state
   */
  async getStep(traceId: string, stepNumber: number): Promise<StepState | null> {
    const key = `trace:${traceId}:step:${stepNumber}`;
    const data = await this.client.hGetAll(key);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      trace_id: data.trace_id,
      step_number: parseInt(data.step_number),
      step_id: data.step_id,
      step_type: data.step_type,
      name: data.name,
      status: data.status as TraceFlowStepStatus,
      started_at: data.started_at,
      updated_at: data.updated_at,
      finished_at: data.finished_at,
      input: data.input ? JSON.parse(data.input) : undefined,
      output: data.output ? JSON.parse(data.output) : undefined,
      error: data.error,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
      last_activity_at: data.last_activity_at,
    };
  }

  /**
   * Get all steps for a trace
   */
  async getSteps(traceId: string): Promise<StepState[]> {
    const pattern = `trace:${traceId}:step:*`;
    const keys = await this.client.keys(pattern);
    
    if (keys.length === 0) {
      return [];
    }

    const steps: StepState[] = [];
    for (const key of keys) {
      const data = await this.client.hGetAll(key);
      if (data && Object.keys(data).length > 0) {
        steps.push({
          trace_id: data.trace_id,
          step_number: parseInt(data.step_number),
          step_id: data.step_id,
          step_type: data.step_type,
          name: data.name,
          status: data.status as TraceFlowStepStatus,
          started_at: data.started_at,
          updated_at: data.updated_at,
          finished_at: data.finished_at,
          input: data.input ? JSON.parse(data.input) : undefined,
          output: data.output ? JSON.parse(data.output) : undefined,
          error: data.error,
          metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
          last_activity_at: data.last_activity_at,
        });
      }
    }

    return steps.sort((a, b) => a.step_number - b.step_number);
  }

  /**
   * Get the highest step number for a trace
   */
  async getLastStepNumber(traceId: string): Promise<number> {
    const steps = await this.getSteps(traceId);
    
    if (steps.length === 0) {
      return -1;
    }

    return Math.max(...steps.map(s => s.step_number));
  }

  /**
   * Delete step state
   */
  async deleteStep(traceId: string, stepNumber: number): Promise<void> {
    const key = `trace:${traceId}:step:${stepNumber}`;
    await this.client.del(key);
    await this.client.zRem(`trace:${traceId}:steps:activity`, stepNumber.toString());
  }

  /**
   * Check if trace exists and is active
   */
  async isTraceActive(traceId: string): Promise<boolean> {
    const trace = await this.getTrace(traceId);
    
    if (!trace) {
      return false;
    }

    return trace.status === TraceFlowTraceStatus.PENDING || trace.status === TraceFlowTraceStatus.RUNNING;
  }

  /**
   * Check if step is closed
   */
  async isStepClosed(traceId: string, stepNumber: number): Promise<boolean> {
    const step = await this.getStep(traceId, stepNumber);
    
    if (!step) {
      return false; // Step doesn't exist yet
    }

    return step.status === TraceFlowStepStatus.COMPLETED || step.status === TraceFlowStepStatus.FAILED;
  }

  /**
   * Get inactive traces (last_activity_at older than threshold)
   */
  async getInactiveTraces(timeoutSeconds: number): Promise<TraceState[]> {
    const now = Date.now();
    const threshold = now - (timeoutSeconds * 1000);
    
    console.log(`[TraceFlow Redis] Querying inactive traces (timeout: ${timeoutSeconds}s, threshold: ${new Date(threshold).toISOString()})`);
    
    // Get trace IDs with activity before threshold
    const traceIds = await this.client.zRangeByScore('traces:activity', 0, threshold);
    
    console.log(`[TraceFlow Redis] Found ${traceIds.length} potentially inactive traces`);
    
    const traces: TraceState[] = [];
    for (const traceId of traceIds) {
      const trace = await this.getTrace(traceId);
      if (trace && (trace.status === TraceFlowTraceStatus.PENDING || trace.status === TraceFlowTraceStatus.RUNNING)) {
        traces.push(trace);
        console.log(`[TraceFlow Redis] Inactive trace: ${traceId} (status: ${trace.status}, last_activity: ${trace.last_activity_at})`);
      }
    }

    console.log(`[TraceFlow Redis] ✅ Total inactive traces to process: ${traces.length}`);
    return traces;
  }

  /**
   * Get inactive steps for a trace
   */
  async getInactiveSteps(traceId: string, timeoutSeconds: number): Promise<StepState[]> {
    const now = Date.now();
    const threshold = now - (timeoutSeconds * 1000);
    
    console.log(`[TraceFlow Redis] Querying inactive steps for trace: ${traceId} (timeout: ${timeoutSeconds}s)`);
    
    // Get step numbers with activity before threshold
    const stepNumbers = await this.client.zRangeByScore(
      `trace:${traceId}:steps:activity`,
      0,
      threshold
    );
    
    console.log(`[TraceFlow Redis] Found ${stepNumbers.length} potentially inactive steps for trace ${traceId}`);
    
    const steps: StepState[] = [];
    for (const stepNumberStr of stepNumbers) {
      const stepNumber = parseInt(stepNumberStr);
      const step = await this.getStep(traceId, stepNumber);
      if (step && (step.status === TraceFlowStepStatus.STARTED || step.status === TraceFlowStepStatus.IN_PROGRESS)) {
        steps.push(step);
        console.log(`[TraceFlow Redis] Inactive step: ${traceId}:${stepNumber} (status: ${step.status}, last_activity: ${step.last_activity_at})`);
      }
    }

    console.log(`[TraceFlow Redis] ✅ Total inactive steps for trace ${traceId}: ${steps.length}`);
    return steps;
  }
}

