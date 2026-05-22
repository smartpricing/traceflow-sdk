package com.smartness.traceflow.transport;

import com.smartness.traceflow.dto.TraceEvent;

/**
 * Drop-in Transport used when the SDK is disabled. Silently discards every event
 * so callers can keep startTrace/startStep/finish/fail/log without any HTTP traffic,
 * circuit-breaker noise, or required configuration.
 */
public final class NullTransport implements Transport {

    @Override
    public void send(TraceEvent event) {
        // no-op
    }

    @Override
    public void flush() {
        // no-op
    }

    @Override
    public void shutdown() {
        // no-op
    }
}
