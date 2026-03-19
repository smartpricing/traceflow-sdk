package com.smartness.traceflow.transport;

import com.smartness.traceflow.exception.TraceFlowException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

public final class RetryExecutor {

    private static final Logger log = LoggerFactory.getLogger(RetryExecutor.class);

    private final int maxRetries;
    private final long retryDelayMs;

    public RetryExecutor(int maxRetries, long retryDelayMs) {
        this.maxRetries = maxRetries;
        this.retryDelayMs = retryDelayMs;
    }

    public <T> T execute(Callable<T> action) {
        return execute(action, 0);
    }

    private <T> T execute(Callable<T> action, int attempt) {
        try {
            return action.call();
        } catch (Exception e) {
            if (attempt < maxRetries) {
                long delay = retryDelayMs * (1L << attempt);
                log.debug("Retry attempt {} after {}ms: {}", attempt + 1, delay, e.getMessage());
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new TraceFlowException("Retry interrupted", ie);
                }
                return execute(action, attempt + 1);
            }
            throw new TraceFlowException("Failed after " + maxRetries + " retries", e);
        }
    }

    public <T> CompletableFuture<T> executeAsync(Supplier<CompletableFuture<T>> asyncAction) {
        return executeAsync(asyncAction, 0);
    }

    private <T> CompletableFuture<T> executeAsync(Supplier<CompletableFuture<T>> asyncAction, int attempt) {
        CompletableFuture<T> stage;
        try {
            stage = asyncAction.get();
        } catch (Exception e) {
            stage = CompletableFuture.failedFuture(new TraceFlowException("Request failed", e));
        }
        return stage.exceptionallyCompose(ex -> {
            if (attempt < maxRetries) {
                long delay = retryDelayMs * (1L << attempt);
                log.debug("Async retry attempt {} after {}ms: {}", attempt + 1, delay, ex.getMessage());
                Executor delayed = CompletableFuture.delayedExecutor(delay, TimeUnit.MILLISECONDS);
                return CompletableFuture.supplyAsync(() -> null, delayed)
                        .thenCompose(__ -> executeAsync(asyncAction, attempt + 1));
            }
            return CompletableFuture.failedFuture(
                    new TraceFlowException("Failed after " + maxRetries + " retries", ex));
        });
    }
}
