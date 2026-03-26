package com.smartness.traceflow.transport;

import com.smartness.traceflow.exception.TraceFlowException;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class RetryExecutorTest {

    @Test
    void successOnFirstAttempt() {
        RetryExecutor executor = new RetryExecutor(3, 10);
        String result = executor.execute(() -> "ok");
        assertEquals("ok", result);
    }

    @Test
    void retriesOnFailureThenSucceeds() {
        RetryExecutor executor = new RetryExecutor(3, 10);
        AtomicInteger attempts = new AtomicInteger(0);

        String result = executor.execute(() -> {
            if (attempts.incrementAndGet() < 3) {
                throw new RuntimeException("fail");
            }
            return "recovered";
        });

        assertEquals("recovered", result);
        assertEquals(3, attempts.get());
    }

    @Test
    void throwsAfterMaxRetries() {
        RetryExecutor executor = new RetryExecutor(2, 10);

        assertThrows(TraceFlowException.class, () ->
                executor.execute(() -> { throw new RuntimeException("always fails"); })
        );
    }

    @Test
    void asyncSuccessOnFirstAttempt() throws Exception {
        RetryExecutor executor = new RetryExecutor(3, 10);
        String result = executor.executeAsync(() -> CompletableFuture.completedFuture("async-ok")).get();
        assertEquals("async-ok", result);
    }

    @Test
    void asyncRetriesOnFailureThenSucceeds() throws Exception {
        RetryExecutor executor = new RetryExecutor(3, 10);
        AtomicInteger attempts = new AtomicInteger(0);

        String result = executor.<String>executeAsync(() -> {
            if (attempts.incrementAndGet() < 3) {
                return CompletableFuture.failedFuture(new RuntimeException("fail"));
            }
            return CompletableFuture.completedFuture("async-recovered");
        }).get();

        assertEquals("async-recovered", result);
    }

    @Test
    void zeroRetriesFailsImmediately() {
        RetryExecutor executor = new RetryExecutor(0, 10);

        assertThrows(TraceFlowException.class, () ->
                executor.execute(() -> { throw new RuntimeException("instant fail"); })
        );
    }
}
