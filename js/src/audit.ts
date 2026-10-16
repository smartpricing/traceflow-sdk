import { randomUUID } from 'node:crypto';

export type AuditJson = null | boolean | number | string | AuditJson[] | { [key: string]: AuditJson };
export type AuditObject = { [key: string]: AuditJson };
export interface AuditReference { type: string; id: string }
export interface AuditInput {
  event_id?: string;
  occurred_at?: string;
  subject?: AuditReference;
  action: string;
  category?: string;
  description?: string;
  actor?: AuditReference & { label?: string };
  changes?: { mode: 'delta' | 'snapshot'; before: AuditObject; after: AuditObject };
  metadata?: AuditObject;
  origin?: { channel: string; client_source?: string; release?: string };
  request_id?: string;
  trace_id?: string;
  batch_id?: string;
  subject_version?: string;
  redacted_fields?: string[];
}
export type AuditEvent = AuditInput & { schema_version: 1; kind: 'audit'; source: string; event_id: string; occurred_at: string };
export interface AuditReceipt { status: 'persisted'; event_id: string; duplicate: boolean; received_at: string; expires_at: string }
export interface AuditClientConfig {
  source: string;
  endpoint?: string;
  apiKey?: string;
  enabled?: boolean;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  fetch?: typeof fetch;
}

function canonical(value: unknown, depth = 0): string {
  if (depth > 32) throw new TypeError('Audit JSON exceeds depth 32');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, item => canonical(item, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], depth + 1)}`).join(',')}}`;
  throw new TypeError('Audit values must be lossless JSON; serialize dates and large numbers explicitly');
}

/** Absent keys and null are different. Nested objects/arrays are compared as whole fields. */
export function auditDiff(before: AuditObject, after: AuditObject): { mode: 'delta'; before: AuditObject; after: AuditObject } {
  const oldValues: AuditObject = Object.create(null);
  const newValues: AuditObject = Object.create(null);
  canonical(before); canonical(after);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldPresent = Object.prototype.hasOwnProperty.call(before, key);
    const newPresent = Object.prototype.hasOwnProperty.call(after, key);
    if (oldPresent && newPresent && canonical(before[key]) === canonical(after[key])) continue;
    if (oldPresent) oldValues[key] = before[key];
    if (newPresent) newValues[key] = after[key];
  }
  return JSON.parse(canonical({ mode: 'delta', before: oldValues, after: newValues }));
}

export class AuditDeliveryError extends Error {
  constructor(message: string, public readonly eventId: string, public readonly retryable: boolean, public readonly statusCode?: number) { super(message); }
}

/** Server-side audit writer. Errors are always explicit, independently of tracing silentErrors. */
export class AuditClient {
  constructor(private readonly config: AuditClientConfig) {}

  createEvent(input: AuditInput): AuditEvent {
    const event = {
      ...input, schema_version: 1, kind: 'audit', source: this.config.source,
      event_id: (input.event_id ?? randomUUID()).toLowerCase(), occurred_at: input.occurred_at ?? new Date().toISOString(),
    };
    const encoded = canonical(event);
    if (Buffer.byteLength(encoded) > 262144) throw new TypeError('Audit event exceeds 256 KiB');
    return JSON.parse(encoded);
  }

  /** Persist this envelope in the caller's outbox before invoking record when crash recovery is required. */
  async record(event: AuditEvent): Promise<AuditReceipt> {
    const body = canonical({ ...event, event_id: event.event_id.toLowerCase() }); // Freeze once: retries never observe caller mutations.
    const frozen: AuditEvent = JSON.parse(body);
    if (this.config.enabled === false) throw new AuditDeliveryError('Audit delivery is disabled', frozen.event_id, true);
    if (!this.config.endpoint || !this.config.apiKey || !this.config.source || frozen.source !== this.config.source) throw new AuditDeliveryError('Audit requires endpoint, API key and matching source', frozen.event_id, false);
    if (Buffer.byteLength(body) > 262144) throw new AuditDeliveryError('Audit event exceeds 256 KiB', frozen.event_id, false, 413);
    const send = this.config.fetch ?? globalThis.fetch;
    const retries = Math.min(10, Math.max(0, this.config.maxRetries ?? 3));
    for (let attempt = 0; ; attempt++) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), this.config.timeout ?? 10000);
      let delay = Math.min(30000, (this.config.retryDelay ?? 250) * 2 ** attempt);
      try {
        const response = await send(`${this.config.endpoint.replace(/\/$/, '')}/api/v1/audit-events`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': this.config.apiKey }, body, signal: abort.signal,
        });
        if (response.ok) {
          const receipt = await response.json() as AuditReceipt;
          if (receipt.status !== 'persisted' || receipt.event_id !== frozen.event_id) throw new AuditDeliveryError('Invalid audit persistence receipt', frozen.event_id, true);
          return receipt;
        }
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          delay = Math.max(delay, Math.min(30000, Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0));
        }
        await response.body?.cancel();
        throw new AuditDeliveryError(`Audit request failed (${response.status})`, frozen.event_id, retryable, response.status);
      } catch (error) {
        const failure = error instanceof AuditDeliveryError ? error : new AuditDeliveryError('Audit request failed or timed out', frozen.event_id, true);
        if (!failure.retryable || attempt >= retries) throw failure;
      } finally { clearTimeout(timer); }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async recordAudit(input: AuditInput): Promise<AuditReceipt> { return this.record(this.createEvent(input)); }
}
