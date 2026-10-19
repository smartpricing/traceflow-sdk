# Traceflow JavaScript SDK

[Tracing](#tracing) · [Audit log](#audit-log) · [Frontend errors](#frontend-errors)

## Install

```sh
npm install @dev.smartpricing/traceflow-sdk
```

For Node.js audit and tracing, use the package root, a private `apiKey` and the
service base URL without `/api/v1`.

For frontend errors, use `/browser`, `/nuxt` or `/react-native`, a public
`ingestKey` and the full `/api/v1/client-errors` URL. Configure the ingestion key
in Traceflow for the source/environment and allowed web origin. These entry points
avoid Node/Kafka dependencies. Never put the private API key in frontend code.

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

Record changes from your Node.js backend. The client sends the values you supply;
it does not observe your database automatically. Audit uses HTTP and needs no trace.

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

Search in the dashboard by source, entity type and ID. `actor` identifies who
performed the action; `origin.channel` records `webapp`, `mobile` or another
channel. Set them from the authenticated request and known application context.

| Action | Changes |
| --- | --- |
| `created` | `auditDiff({}, createdValues)` |
| `updated` | `auditDiff(previousValues, currentValues)` |
| `deleted` | `auditDiff(deletedValues, {})` |
| `exported` or another custom action | Omit `changes` if no values changed |

To store complete selected values instead of a diff, use
`changes: { mode: 'snapshot', before: previousValues, after: currentValues }`.

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

## Frontend errors

Install one adapter at startup. Errors appear in the dashboard with their context
and breadcrumbs. Use `captureException()` for errors your application handles.

### Browser

Use this in browser JavaScript, including assets served by Laravel:

```ts
import { installBrowserErrors } from '@dev.smartpricing/traceflow-sdk/browser';

export const reporting = installBrowserErrors({
  endpoint: 'https://traceflow.example.com/api/v1/client-errors',
  ingestKey: 'public-webapp-ingestion-key',
  source: 'webapp',
  environment: 'production',
  release: '1.0.0',
  dist: 'build-commit-or-ota-id',
});

// When opening the editor and starting a save:
reporting.client.setContext({ screen: 'quote-editor' });
reporting.client.addBreadcrumb({ category: 'action', message: 'Save quote' });

// Call from the application's error handler when saving a quote fails.
export function reportQuoteSaveFailure(error: unknown, quoteId: string) {
  reporting.client.captureException(error, { context: { quote_id: quoteId } });
}
```

Captures global JS errors and unhandled promise rejections. Requires `window`;
PHP errors are not captured.

### Nuxt

Create `plugins/traceflow.client.ts` (under `app/` if that is your Nuxt source
directory). This adapter includes browser capture and Nuxt/Vue error hooks:

```ts
import { installNuxtErrors } from '@dev.smartpricing/traceflow-sdk/nuxt';

export default defineNuxtPlugin((nuxtApp) => {
  const reporting = installNuxtErrors(nuxtApp, {
    endpoint: 'https://traceflow.example.com/api/v1/client-errors',
    ingestKey: 'public-webapp-ingestion-key',
    source: 'webapp',
    environment: 'production',
    release: '1.0.0',
    dist: 'build-commit-or-ota-id',
  });
  if (import.meta.hot) import.meta.hot.dispose(() => reporting.dispose());
  return { provide: { errorReporting: reporting.client } };
});
```

In a component or composable, access the client with
`const { $errorReporting } = useNuxtApp()` and call
`$errorReporting.captureException(error)`. Nuxt SSR errors are outside this adapter.

### React Native

Install before rendering the app:

```ts
import { AppState, Platform } from 'react-native';
import { installReactNativeErrors } from '@dev.smartpricing/traceflow-sdk/react-native';

export const reporting = installReactNativeErrors({
  endpoint: 'https://traceflow.example.com/api/v1/client-errors',
  ingestKey: 'public-mobile-ingestion-key',
  source: 'mobile',
  environment: 'production',
  release: '1.0.0',
  dist: 'android-build-42',
  context: { os: Platform.OS },
}, { appState: AppState, requireCoverage: ['globalErrors'] });

// Update from your navigation listener.
reporting.client.setContext({ screen: 'quote-editor' });
```

`requireCoverage` throws if the global JS error hook is unavailable. Unhandled
promise rejections need a runtime-specific hook: see [React Native setup](ERRORS.md#react-native).
Use a different `dist` for each Android/iOS build and OTA update. Native crashes
are not captured.

For React render/lifecycle errors, wrap the app in `TraceflowErrorBoundary` from
`@dev.smartpricing/traceflow-sdk/react`, passing `client={reporting.client}`,
`fallback` and children (React 18+).

### Readable stacks

Generate source maps and upload them from CI with a private API key. For Nuxt,
set `sourcemap: { client: 'hidden' }` in `nuxt.config.ts`. For example:

```sh
# TRACEFLOW_API_KEY is a private secret in the build environment.
npx traceflow-upload-map \
  --url https://traceflow.example.com \
  --source webapp --environment production \
  --release 1.0.0 --dist build-commit-or-ota-id --platform browser \
  --filename /_nuxt/app.js --map .output/public/_nuxt/app.js.map
```

Upload each chunk's map using its actual generated path. Source, environment,
release, dist and platform must match the event. Keep `.map` files out of public
hosting. For mobile, upload the matching composed Metro/Hermes map; see
[source-map uploads](ERRORS.md#upload-source-maps).

The error queue is in memory: closing a tab or terminating an app can lose events.
See [context and delivery](ERRORS.md#context-and-delivery) for redaction with
`beforeSend`, logout cleanup, `flush()`, diagnostics and retry behavior.

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
