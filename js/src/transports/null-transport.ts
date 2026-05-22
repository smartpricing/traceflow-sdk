/**
 * NullTransport - no-op transport used when the SDK is disabled.
 *
 * Mirrors the PHP and Java SDKs: when the master `enabled` flag is `false`,
 * the SDK keeps its full public surface (startTrace/startStep/finish/fail/log
 * all keep working) but every event is silently dropped — no HTTP traffic,
 * no retries, no circuit-breaker noise, no required endpoint config.
 */

import { TraceTransport, TraceEvent, HealthCheckResult } from '../types';

export class NullTransport implements TraceTransport {
  async send(_event: TraceEvent): Promise<void> {
    // no-op
  }

  async flush(): Promise<void> {
    // no-op
  }

  async shutdown(): Promise<void> {
    // no-op
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: true, latencyMs: 0 };
  }
}
