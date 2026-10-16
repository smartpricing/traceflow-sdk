import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorClient, parseStack, sanitize } from "../errors/core";
import {
  installReactNativeErrors,
  type GlobalErrorHandler,
} from "../react-native";
import { installBrowserErrors } from "../browser";
const clients: ErrorClient[] = [];
const options = {
  endpoint: "https://traceflow.example/api/v1/client-errors",
  ingestKey: "public-ingestion-key",
  source: "webapp",
  environment: "test",
  release: "1.0",
  dist: "build-a",
  platform: "browser" as const,
};
const setup = (
  fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 201 })),
) => {
  const client = new ErrorClient({ ...options, fetch });
  clients.push(client);
  return { client, fetch };
};
afterEach(() => {
  clients.forEach((c) => c.close());
  clients.length = 0;
  vi.useRealTimers();
});

describe("client errors", () => {
  it("parses V8, Firefox/JSC and Hermes offsets into 1-based lines and 0-based columns", () => {
    expect(
      parseStack("Error\n at save (https://app.test/a.js:10:5)")[0],
    ).toEqual({
      filename: "https://app.test/a.js",
      function: "save",
      line: 10,
      column: 4,
    });
    expect(parseStack("save@https://app.test/a.js:10:5")[0].column).toBe(4);
    expect(
      parseStack(" at save (address at index.android.bundle:1:502)")[0],
    ).toEqual({
      filename: "index.android.bundle",
      function: "save",
      line: 1,
      column: 502,
    });
    expect(parseStack(" at foo (address at InternalBytecode.js:1:20)")).toEqual(
      [],
    );
  });
  it("freezes context, scrubs secrets/URL queries and deduplicates an Error seen by multiple hooks", async () => {
    const { client, fetch } = setup();
    const circular: Record<string, unknown> = {
      token: "secret",
      url: "https://user:pass@app.test/x?key=secret#hash",
    };
    circular.self = circular;
    client.setContext(circular);
    client.addBreadcrumb({
      category: "navigation",
      message: "https://app.test/quote?token=secret",
    });
    const error = new Error("save failed");
    const id = client.captureException(error, { mechanism: "vue" });
    expect(client.captureException(error, { mechanism: "error" })).toBe(id);
    client.setContext({ token: "changed", later: true });
    expect(await client.flush()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0][1];
    expect(request.headers["X-Traceflow-Ingest-Key"]).toBe(options.ingestKey);
    expect(request.headers["X-API-Key"]).toBeUndefined();
    const event = JSON.parse(request.body);
    expect(event.context.token).toBe("[Filtered]");
    expect(event.context.url).toBe("https://app.test/x");
    expect(event.context.later).toBeUndefined();
    expect(event.context.self.self).toBe("[Circular]");
    expect(event.breadcrumbs[0].message).toBe("https://app.test/quote");
    expect(event.event_id).toBe(id);
  });
  it("retries frozen bytes after 429 and respects Retry-After; transport failures do not recurse", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "10" } }),
      )
      .mockResolvedValue(new Response("{}", { status: 201 }));
    const { client } = setup(fetch);
    client.captureException(new Error("retry"));
    expect(await client.flush()).toBe(false);
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(client.getStats()).toMatchObject({ sent: 1, queued: 0, retries: 1 });
    const broken = setup(vi.fn().mockRejectedValue(new Error("offline")));
    broken.client.captureException(new Error("original"));
    await broken.client.flush();
    expect(broken.client.getStats()).toMatchObject({ queued: 1, retries: 1 });
  });
  it("bounds the queue, handles circular values and drops invalid or rejected events", async () => {
    const client = new ErrorClient({
      ...options,
      maxQueueSize: 1,
      fetch: vi.fn().mockResolvedValue(new Response("", { status: 400 })),
    });
    clients.push(client);
    expect(client.captureException(new Error("one"))).toBeTruthy();
    expect(client.captureException(new Error("two"))).toBeUndefined();
    await client.flush();
    expect(client.getStats()).toMatchObject({ queued: 0, dropped: 2 });
    const throwing = new ErrorClient({
      ...options,
      beforeSend: () => {
        throw new Error("hook");
      },
    });
    clients.push(throwing);
    expect(() => throwing.captureException(new Error("app"))).not.toThrow();
    expect(sanitize({ password: "secret", value: 0 })).toEqual({
      password: "[Filtered]",
      value: 0,
    });
  });
  it("aborts stalled requests within flush deadline", async () => {
    const { client } = setup(
      vi.fn(
        (_url, request) =>
          new Promise((_resolve, reject) => {
            request.signal.addEventListener("abort", () =>
              reject(new Error("abort")),
            );
          }),
      ),
    );
    client.captureException(new Error("timeout"));
    const start = Date.now();
    expect(await client.flush(20)).toBe(false);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

it("RN preserves and restores existing error handling and app-state subscriptions", async () => {
  const previous = vi.fn();
  let handler: GlobalErrorHandler = previous;
  const remove = vi.fn(),
    unsubscribe = vi.fn();
  let rejection: (reason: unknown) => void = () => {};
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
  const native = installReactNativeErrors(
    { ...options, fetch },
    {
      errorUtils: {
        getGlobalHandler: () => handler,
        setGlobalHandler: (h) => {
          handler = h;
        },
      },
      appState: { addEventListener: () => ({ remove }) },
      subscribeUnhandledRejection: (listener) => {
        rejection = listener;
        return unsubscribe;
      },
    },
  );
  clients.push(native.client);
  const error = new Error("fatal");
  handler(error, true);
  rejection(new Error("rejected"));
  expect(previous).toHaveBeenCalledWith(error, true);
  expect(native.coverage).toEqual({
    globalErrors: true,
    unhandledRejections: true,
  });
  await native.client.flush();
  expect(fetch).toHaveBeenCalledTimes(2);
  native.dispose();
  expect(handler).toBe(previous);
  expect(remove).toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalled();
});

it("browser listeners capture globals without preventing default behavior and remove cleanly", async () => {
  const target = new EventTarget() as EventTarget & {
    location: { href: string };
    document: EventTarget & { visibilityState: string };
  };
  target.location = { href: "https://app.test/page?secret=value" };
  target.document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
  const browser = installBrowserErrors(
    { ...options, fetch },
    target as unknown as Window,
  );
  clients.push(browser.client);
  const event = Object.assign(new Event("error", { cancelable: true }), {
    error: new Error("global"),
  });
  target.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  await browser.client.flush();
  expect(JSON.parse(fetch.mock.calls[0][1].body).context.page).toBe(
    "https://app.test/page",
  );
  browser.dispose();
  target.dispatchEvent(event);
  expect(browser.client.getStats().queued).toBe(0);
});
