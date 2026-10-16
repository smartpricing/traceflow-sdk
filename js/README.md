# Traceflow JavaScript SDK

The root entry point provides trace, step, log and audit clients for Node.js.
Browser and React Native error reporting use separate entry points that avoid
Node dependencies. See [frontend error setup](ERRORS.md).

## Install

```sh
npm install @dev.smartpricing/traceflow-sdk
```

Use HTTP with the current Traceflow service. Set `endpoint` to its base URL,
without `/api/v1`, and use a server API key accepted by the service.

## Tracing

```ts
import { TraceFlowSDK } from '@dev.smartpricing/traceflow-sdk';

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'booking-api',
  endpoint: 'http://localhost:3009',
  apiKey: process.env.TRACEFLOW_API_KEY,
});

const trace = await sdk.startTrace({
  trace_type: 'quote',
  title: 'Calculate quote',
});
const step = await trace.startStep({ name: 'Calculate total' });
await step.log('Calculation completed');
await step.finish({ output: { total: '420.00' } });
await trace.finish({ result: { quote_id: '12345' } });

// At application shutdown, not after every request:
await sdk.shutdown();
```

`trace.fail(error)` and `step.fail(error)` record failures. Explicit trace and
step IDs must be UUIDs; omit them to generate IDs.

For asynchronous request context, `runWithTrace(options, fn)` makes the trace
available through `sdk.getCurrentTrace()` and `sdk.startStep()`. It finishes the
trace when the callback returns, or fails it and rethrows when the callback throws.

For another service to continue a trace, pass its ID in a request header and use
`sdk.getTrace(traceId)`. HTTP reads live state from the backend; with
`silentErrors: true`, a failed read can still return a local handle, so a handle
alone is not evidence that the trace exists. `sdk.heartbeat(traceId)` refreshes
activity for long-running work.

HTTP middleware is available as
[`createExpressMiddleware`](src/middleware/express.ts) and
[`traceflowFastifyPlugin`](src/middleware/fastify.ts). Both accept `ignorePaths`.
Full method and option types are in [src/types.ts](src/types.ts).

## Audit log

Audit events do not require a trace. They always use the HTTP audit API,
independently of the tracing transport.

```ts
import { AuditClient, auditDiff } from '@dev.smartpricing/traceflow-sdk';

const audit = new AuditClient({
  source: 'booking-api',
  endpoint: 'http://localhost:3009',
  apiKey: process.env.TRACEFLOW_API_KEY,
});

const event = audit.createEvent({
  subject: { type: 'quote', id: '12345' },
  action: 'updated',
  actor: { type: 'user', id: '42' },
  origin: { channel: 'webapp' },
  changes: auditDiff({ total: '450.00', note: null }, { total: '420.00' }),
  metadata: { reason: 'Discount agreed' },
});

const receipt = await audit.record(event);
```

This example sends directly. For recovery after a process crash, store `event`
in your application's outbox in the same transaction as the business change.
The publisher must reuse that envelope on every attempt and remove it only after
`record()` succeeds. This package does not provide a Node database outbox.

`recordAudit(input)` creates and sends an envelope in one call. An existing
`TraceFlowSDK` exposes the same methods through `sdk.audit` and `sdk.recordAudit()`.
Do not call `recordAudit()` again to retry an operation: that generates a new ID
unless one was supplied.

`AuditDeliveryError` exposes `eventId`, `retryable` and `statusCode`. Network
failures, `408`, `429` and `5xx` are retried with the same payload. A `409` payload
conflict is not retried. Audit delivery failures are thrown regardless of tracing
`silentErrors`; `enabled: false` also throws a retryable delivery error.

Subject types and IDs are strings. `auditDiff()` distinguishes absent keys from
`null` and compares nested objects/arrays as whole fields. Skip updates whose
diff is empty. Creation uses `{}` before; deletion uses `{}` after. Custom
activities such as `exported` can omit changes.

Select fields and redact metadata before creating the event. Serialize dates
explicitly; use strings for exact decimals and large integers. The payload limit
is 256 KiB with a maximum JSON depth of 32. See [audit types](src/audit.ts) for
optional context fields and [the backend contract](https://github.com/smartpricing/traceflow-service#audit-log)
for retention, responses and queries.

## Configuration and delivery

| Option | Tracing default | Standalone `AuditClient` default |
| --- | --- | --- |
| `timeout` (ms) | `5000` for HTTP | `10000` |
| `maxRetries` | `3` | `3` |
| `retryDelay` (ms) | `1000` | `250` |
| `enabled` | `true`; disabled tracing drops events | `true`; disabled delivery throws |
| `silentErrors` | `true`; suppresses tracing delivery errors | Not used |

`sdk.audit` inherits the SDK configuration, including its retry defaults.
Configuration and input errors can still throw. Tracing queues are in memory;
`flush()` and `shutdown()` attempt delivery but do not provide crash recovery.
Audit reliability depends on preserving the event outside the process.

Use a distinct `source` for each environment sharing the backend. Keep API keys
in backend configuration.

### Kafka tracing

The SDK also includes a Kafka producer, which requires the optional dependency:

```sh
npm install @confluentinc/kafka-javascript
```

Configure `transport: 'kafka'` and `kafka.brokers` to use it. This requires a
separately operated consumer: the current Traceflow HTTP service does not start
one. Audit events still require an HTTP endpoint and API key.

## Development

From this directory:

```sh
npm install
npm run build
npm test -- --run
npm run typecheck
```

The build emits CommonJS, ESM and TypeScript declarations. Check typecheck results
separately: a successful package build does not validate every example and test.
Building declarations also requires the optional Kafka package's types, even
when the application uses HTTP.

License: ISC.

## Frontend errors

Use `/browser`, `/nuxt` or `/react-native` to capture JavaScript errors, context
and breadcrumbs without Node/Kafka dependencies. `/react` provides an error
boundary. See [setup and delivery behavior](ERRORS.md) for public ingestion keys,
source-map uploads, runtime coverage and examples.
