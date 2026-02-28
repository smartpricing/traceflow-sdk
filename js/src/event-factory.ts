/**
 * Event Factory - Centralized TraceEvent construction
 * Reduces duplication between SDK and handle implementations
 */

import { v4 as uuidv4 } from 'uuid';
import { TraceEvent, TraceEventType } from './types';

export function createTraceEvent(
  eventType: TraceEventType,
  traceId: string,
  source: string,
  payload: Record<string, any>,
  stepId?: string
): TraceEvent {
  return {
    event_id: uuidv4(),
    event_type: eventType,
    trace_id: traceId,
    step_id: stepId,
    timestamp: new Date().toISOString(),
    source,
    payload,
  };
}
