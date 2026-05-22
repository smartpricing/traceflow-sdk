package com.smartness.traceflow.transport;

import com.smartness.traceflow.dto.TraceEvent;

public sealed interface Transport permits HttpTransport, AsyncHttpTransport, NullTransport {

    void send(TraceEvent event);

    void flush();

    void shutdown();
}
