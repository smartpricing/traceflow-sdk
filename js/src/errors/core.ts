export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface ErrorFrame {
  filename: string;
  function?: string;
  line: number;
  column: number;
}
export interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
  data?: Record<string, Json>;
}
export interface ClientErrorEvent {
  schema_version: 1;
  kind: "client.error";
  event_id: string;
  occurred_at: string;
  source: string;
  environment: string;
  platform: "browser" | "react-native";
  release: string;
  dist: string;
  exception: {
    type: string;
    message: string;
    stack: string;
    frames: ErrorFrame[];
  };
  mechanism:
    "manual" | "error" | "unhandledrejection" | "vue" | "nuxt" | "react-native";
  handled: boolean;
  context: Record<string, Json>;
  breadcrumbs: Breadcrumb[];
}
export type DropReason =
  | "sampled"
  | "filtered"
  | "invalid"
  | "oversize"
  | "queue_full"
  | "expired"
  | "rejected"
  | "retry_exhausted"
  | "paused"
  | "closed";
export interface ErrorDiagnostic {
  type: "dropped" | "retry" | "paused";
  reason?: DropReason;
  status?: number;
  /** For `paused`: epoch milliseconds when capture resumes. */
  until?: number;
  queued: number;
}
/** Server body limit is 64 KiB; keep a margin for headers and encoding. */
const MAX_EVENT_BYTES = 60000;
const MAX_FRAMES = 100;
/** Pause lengths after a rejected key or origin: 1, 2, 4, 8, 16, 32 minutes. */
const MAX_AUTH_FAILURES = 6;
export interface ErrorClientOptions {
  endpoint: string;
  ingestKey: string;
  source: string;
  environment: string;
  release: string;
  dist: string;
  platform: ClientErrorEvent["platform"];
  context?: Record<string, unknown>;
  beforeSend?: (event: ClientErrorEvent) => ClientErrorEvent | null;
  fetch?: typeof fetch;
  maxQueueSize?: number;
  sampleRate?: number;
  /** Contains delivery metadata only. Exceptions in this hook are ignored. */
  onDiagnostic?: (diagnostic: ErrorDiagnostic) => void;
}
export interface CaptureOptions {
  mechanism?: ClientErrorEvent["mechanism"];
  handled?: boolean;
  context?: Record<string, unknown>;
  frames?: ErrorFrame[];
}
export function cleanUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.origin === "null"
      ? value.split(/[?#]/, 1)[0]
      : url.origin + url.pathname;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}
const secret =
  /password|passwd|secret|token|authorization|cookie|api.?key|credit.?card|email/i;
export function sanitize(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): Json {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string")
    return value.slice(0, 2000).replace(/https?:\/\/[^\s)]+/g, cleanUrl);
  if (depth >= 6) return "[Truncated]";
  if (typeof value !== "object" || !value) return String(value).slice(0, 200);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (Array.isArray(value))
      return value.slice(0, 30).map((v) => sanitize(v, depth + 1, seen));
    const result: Record<string, Json> = Object.create(null);
    for (const key of Object.keys(value).slice(0, 30)) {
      if (secret.test(key)) {
        result[key.slice(0, 100)] = "[Filtered]";
        continue;
      }
      try {
        result[key.slice(0, 100)] = sanitize(
          (value as Record<string, unknown>)[key],
          depth + 1,
          seen,
        );
      } catch {
        result[key.slice(0, 100)] = "[Unreadable]";
      }
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
export function parseStack(stack: string): ErrorFrame[] {
  const frames: ErrorFrame[] = [];
  for (const raw of stack.split("\n").slice(0, 150)) {
    let line = raw.trim();
    const hermes = line.includes("address at ");
    line = line.replace(/^at\s+/, "").replace(/address at /, "");
    const match = /^(.*?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) continue;
    let filename = match[1],
      name = "";
    const paren = filename.lastIndexOf(" (");
    if (paren >= 0) {
      name = filename.slice(0, paren);
      filename = filename.slice(paren + 2);
    } else {
      const at = filename.indexOf("@");
      if (at >= 0 && !filename.startsWith("http")) {
        name = filename.slice(0, at);
        filename = filename.slice(at + 1);
      }
    }
    if (
      filename.includes("InternalBytecode") ||
      !filename ||
      Number(match[2]) < 1
    )
      continue;
    frames.push({
      filename: cleanUrl(filename).slice(0, 2048),
      ...(name ? { function: name.slice(0, 500) } : {}),
      line: Number(match[2]),
      column: Math.max(0, Number(match[3]) - (hermes ? 0 : 1)),
    });
    if (frames.length === MAX_FRAMES) break;
  }
  return frames;
}
/** Caller-supplied frames are untrusted input: apply the server contract before queueing. */
export function normalizeFrames(frames: unknown): ErrorFrame[] | undefined {
  if (!Array.isArray(frames)) return undefined;
  const result: ErrorFrame[] = [];
  for (const frame of frames as Partial<ErrorFrame>[]) {
    if (
      !frame ||
      typeof frame.filename !== "string" ||
      !frame.filename ||
      !Number.isInteger(frame.line) ||
      (frame.line as number) < 1 ||
      !Number.isInteger(frame.column) ||
      (frame.column as number) < 0
    )
      continue;
    result.push({
      filename: cleanUrl(frame.filename).slice(0, 2048),
      ...(typeof frame.function === "string" && frame.function
        ? { function: frame.function.slice(0, 500) }
        : {}),
      line: Math.min(frame.line as number, 10000000),
      column: Math.min(frame.column as number, 100000000),
    });
    if (result.length === MAX_FRAMES) break;
  }
  return result;
}
/** Conservative UTF-8 bound without relying on TextEncoder in React Native. */
function utf8Length(value: string): number {
  return encodeURIComponent(value).replace(/%[A-F\d]{2}/g, "_").length;
}
function uuid(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues)
    globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return Array.from(
    bytes,
    (b, i) =>
      ([4, 6, 8, 10].includes(i) ? "-" : "") + b.toString(16).padStart(2, "0"),
  ).join("");
}
type Pending = {
  body: string;
  attempts: number;
  next: number;
  created: number;
};
export class ErrorClient {
  private queue: Pending[] = [];
  private context: Record<string, unknown>;
  private breadcrumbs: Breadcrumb[] = [];
  private seen = new WeakMap<object, { id: string; at: number }>();
  private timer?: ReturnType<typeof setTimeout>;
  private sending?: Promise<void>;
  private closed = false;
  private capturing = false;
  private reporting = false;
  private pausedUntil = 0;
  private authFailures = 0;
  private abort?: AbortController;
  private readonly droppedByReason: Partial<Record<DropReason, number>> = {};
  private readonly send: typeof fetch;
  private readonly maxQueue: number;
  private readonly stats = { sent: 0, dropped: 0, retries: 0 };
  constructor(private readonly options: ErrorClientOptions) {
    for (const key of [
      "source",
      "environment",
      "release",
      "dist",
      "ingestKey",
    ] as const) {
      if (!options[key]?.trim() || options[key].length > 200)
        throw new Error(`Invalid Traceflow ${key}`);
    }
    // Pattern check instead of URL getters: React Native's built-in URL throws
    // "not implemented" for several of them unless a polyfill is installed.
    if (
      typeof options.endpoint !== "string" ||
      options.endpoint.length > 2048 ||
      !/^https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/i.test(options.endpoint)
    )
      throw new Error("Invalid Traceflow error endpoint");
    if (
      options.sampleRate !== undefined &&
      (!Number.isFinite(options.sampleRate) ||
        options.sampleRate < 0 ||
        options.sampleRate > 1)
    )
      throw new Error("sampleRate must be between 0 and 1");
    if (
      options.maxQueueSize !== undefined &&
      (!Number.isInteger(options.maxQueueSize) ||
        options.maxQueueSize < 1 ||
        options.maxQueueSize > 100)
    )
      throw new Error("maxQueueSize must be an integer between 1 and 100");
    this.send = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxQueue = Math.max(1, Math.min(100, options.maxQueueSize ?? 30));
    this.context = { session_id: uuid(), ...options.context };
  }
  setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }
  clearContext(): void {
    this.context = { session_id: uuid() };
    this.breadcrumbs = [];
  }
  addBreadcrumb(input: {
    category: string;
    message: string;
    data?: Record<string, unknown>;
  }): void {
    try {
      this.breadcrumbs.push({
        timestamp: new Date().toISOString(),
        category: input.category.trim().slice(0, 200) || "app",
        message: String(sanitize(input.message)).slice(0, 1000),
        ...(input.data
          ? { data: sanitize(input.data) as Record<string, Json> }
          : {}),
      });
      this.breadcrumbs = this.breadcrumbs.slice(-50);
    } catch {
      /* Diagnostic context must not break the application. */
    }
  }
  captureException(
    error: unknown,
    capture: CaptureOptions = {},
  ): string | undefined {
    if (this.closed || this.capturing || this.reporting) return;
    this.capturing = true;
    try {
      const now = Date.now();
      if (now < this.pausedUntil) {
        this.drop("paused");
        return;
      }
      if (error && typeof error === "object") {
        const previous = this.seen.get(error);
        if (previous && now - previous.at < 1000) return previous.id;
      }
      if (Math.random() >= (this.options.sampleRate ?? 1)) {
        this.drop("sampled");
        return;
      }
      const object =
        error && typeof error === "object"
          ? (error as { name?: unknown; message?: unknown; stack?: unknown })
          : null;
      const stack = (typeof object?.stack === "string" ? object.stack : "")
        .slice(0, 24000)
        .replace(/https?:\/\/[^\s)]+/g, (value) => {
          // Preserve :line:column after stripping query values from a script URL.
          const position = /(:\d+:\d+)$/.exec(value)?.[1] ?? "";
          return (
            cleanUrl(position ? value.slice(0, -position.length) : value) +
            position
          );
        });
      let event: ClientErrorEvent | null = {
        schema_version: 1,
        kind: "client.error",
        event_id: uuid(),
        occurred_at: new Date(now).toISOString(),
        source: this.options.source,
        environment: this.options.environment,
        release: this.options.release,
        dist: this.options.dist,
        platform: this.options.platform,
        exception: {
          type:
            (typeof object?.name === "string" ? object.name : "Error").slice(
              0,
              200,
            ) || "Error",
          message: String(
            sanitize(
              typeof object?.message === "string" ? object.message : error,
            ),
          ).slice(0, 4000),
          stack,
          frames: normalizeFrames(capture.frames) ?? parseStack(stack),
        },
        mechanism: capture.mechanism ?? "manual",
        handled: capture.handled ?? true,
        context: sanitize({ ...this.context, ...capture.context }) as Record<
          string,
          Json
        >,
        breadcrumbs: this.breadcrumbs.map((b) => ({ ...b })),
      };
      if (this.options.beforeSend) event = this.options.beforeSend(event);
      if (!event) {
        this.drop("filtered");
        return;
      }
      // beforeSend output is untrusted: re-apply the frame contract.
      event = {
        ...event,
        exception: {
          ...event.exception,
          frames: normalizeFrames(event.exception.frames) ?? [],
        },
      };
      let body = JSON.stringify(event);
      if (utf8Length(body) > MAX_EVENT_BYTES && event.breadcrumbs.length) {
        // Keep the exception; shed diagnostic context before dropping the event.
        event = {
          ...event,
          breadcrumbs: [],
          context: { ...event.context, truncated: "breadcrumbs" },
        };
        body = JSON.stringify(event);
      }
      if (utf8Length(body) > MAX_EVENT_BYTES) {
        const session = event.context.session_id;
        event = {
          ...event,
          context: {
            ...(typeof session === "string" ? { session_id: session } : {}),
            truncated: "context",
          },
          exception: {
            ...event.exception,
            stack: event.exception.stack.slice(0, 8000),
          },
        };
        body = JSON.stringify(event);
      }
      if (utf8Length(body) > MAX_EVENT_BYTES) {
        this.drop("oversize");
        return;
      }
      if (this.queue.length >= this.maxQueue) {
        this.drop("queue_full");
        return;
      }
      this.queue.push({ body, attempts: 0, next: now, created: now });
      if (error && typeof error === "object")
        this.seen.set(error, { id: event.event_id, at: now });
      this.schedule();
      return event.event_id;
    } catch {
      this.drop("invalid");
      return;
    } finally {
      this.capturing = false;
    }
  }
  private schedule(): void {
    if (this.closed || this.timer || !this.queue.length) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.flush(5000);
      },
      Math.max(50, this.queue[0].next - Date.now()),
    );
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }
  async flush(timeoutMs = 2000): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    while (!this.closed && this.queue.length && Date.now() < deadline) {
      if (this.sending) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.sending,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        continue;
      }
      const pending = this.queue[0];
      if (pending.next > Date.now()) break;
      this.sending = this.deliver(
        pending,
        Math.min(5000, deadline - Date.now()),
      );
      try {
        await this.sending;
      } finally {
        this.sending = undefined;
      }
    }
    this.schedule();
    return this.queue.length === 0;
  }
  private async deliver(pending: Pending, timeoutMs: number): Promise<void> {
    if (Date.now() - pending.created > 300000) {
      this.queue.shift();
      this.drop("expired");
      return;
    }
    const abort = new AbortController();
    this.abort = abort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort.signal.addEventListener(
        "abort",
        () => reject(new Error("Delivery cancelled")),
        { once: true },
      );
      timer = setTimeout(() => abort.abort(), timeoutMs);
    });
    let retryAfter = 0,
      status: number | undefined;
    try {
      const response = await Promise.race([
        cancelled,
        this.send(this.options.endpoint, {
          method: "POST",
          body: pending.body,
          headers: {
            "Content-Type": "application/json",
            "X-Traceflow-Ingest-Key": this.options.ingestKey,
          },
          signal: abort.signal,
          ...(this.options.platform === "browser"
            ? { keepalive: true, credentials: "omit" as const }
            : {}),
        }),
      ]);
      if (this.closed) return;
      status = response.status;
      if (response.ok) {
        this.queue.shift();
        this.stats.sent++;
        this.authFailures = 0;
        return;
      }
      if (
        response.status !== 429 &&
        response.status < 500 &&
        response.status !== 408
      ) {
        this.queue.shift();
        this.drop("rejected", response.status);
        if (response.status === 401 || response.status === 403)
          this.pause(response.status);
        return;
      }
      const header = response.headers.get("Retry-After");
      if (header)
        retryAfter = /^\d+$/.test(header)
          ? Number(header) * 1000
          : Math.max(0, Date.parse(header) - Date.now());
    } catch {
      /* The transport cannot recursively capture its own failures. */
    } finally {
      if (timer) clearTimeout(timer);
      this.abort = undefined;
    }
    if (this.closed) return;
    pending.attempts++;
    if (pending.attempts >= 5) {
      this.queue.shift();
      this.drop("retry_exhausted", status);
      return;
    }
    pending.next =
      Date.now() +
      Math.max(
        Number.isFinite(retryAfter) ? retryAfter : 0,
        Math.min(30000, 1000 * 2 ** (pending.attempts - 1)),
      );
    this.stats.retries++;
    this.notify({ type: "retry", status, queued: this.queue.length });
  }
  /**
   * A rejected key or origin applies to every event from this client. Stop
   * sending for a growing interval instead of repeating the same failure.
   */
  private pause(status: number) {
    const count = this.queue.length;
    this.queue = [];
    if (count) this.drop("rejected", status, count);
    this.authFailures = Math.min(MAX_AUTH_FAILURES, this.authFailures + 1);
    this.pausedUntil = Date.now() + 60000 * 2 ** (this.authFailures - 1);
    this.notify({
      type: "paused",
      status,
      until: this.pausedUntil,
      queued: 0,
    });
  }
  private notify(diagnostic: ErrorDiagnostic) {
    if (this.reporting) return;
    this.reporting = true;
    try {
      this.options.onDiagnostic?.(diagnostic);
    } catch {
      /* Never report reporting failures. */
    } finally {
      this.reporting = false;
    }
  }
  private drop(reason: DropReason, status?: number, count = 1) {
    this.stats.dropped += count;
    this.droppedByReason[reason] = (this.droppedByReason[reason] ?? 0) + count;
    this.notify({ type: "dropped", reason, status, queued: this.queue.length });
  }
  getStats() {
    return {
      ...this.stats,
      queued: this.queue.length,
      paused: Date.now() < this.pausedUntil,
      droppedByReason: { ...this.droppedByReason },
    };
  }
  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    const count = this.queue.length;
    this.queue = [];
    if (count) this.drop("closed", undefined, count);
    this.abort?.abort();
  }
}
