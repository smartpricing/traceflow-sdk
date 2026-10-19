# Traceflow JavaScript SDK

[Tracing](#tracing) · [Audit Log](#audit-log) · [Error Monitoring](#error-monitoring)

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

`runWithTrace(options, fn)` provides request context, finishes on return and fails
on throw. `sdk.getTrace(traceId)` continues a trace; with `silentErrors: true`, a
returned handle does not prove the remote trace exists.

HTTP middleware: [`createExpressMiddleware`](src/middleware/express.ts) and
[`traceflowFastifyPlugin`](src/middleware/fastify.ts). See [types](src/types.ts)
for their options and the full tracing API.

## Audit Log

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

Search by source, entity type and ID. Set `actor` and `origin.channel` from the
authenticated request and known application context.

| Action | Changes |
| --- | --- |
| `created` | `auditDiff({}, createdValues)` |
| `updated` | `auditDiff(previousValues, currentValues)` |
| `deleted` | `auditDiff(deletedValues, {})` |
| Custom action, e.g. `exported` | Omit `changes` if no values changed |

`auditDiff()` distinguishes absent fields from `null`; nested objects and arrays
are compared as whole fields. Skip empty updates. For complete selected values,
use `changes: { mode: 'snapshot', before, after }`.

For crash recovery, save `event` in your database outbox in the same transaction
as the business change. Retry `audit.record(event)` with that saved envelope and
remove it only after success. The Node SDK does not provide a database outbox.
`recordAudit(input)` creates a new envelope each time; do not use it for retries.
Existing SDK instances expose `sdk.audit` and `sdk.recordAudit()`.

Delivery failures throw `AuditDeliveryError` with `eventId`, `retryable` and
`statusCode`, regardless of tracing `silentErrors`. Network errors, `408`, `429`
and `5xx` are retried; `409` payload conflicts are not.

Select and redact fields before sending. Serialize dates, exact decimals and
large integers as strings. Payloads must fit 256 KiB and JSON depth 32. See
[audit types](src/audit.ts) and the [backend contract](https://github.com/smartpricing/traceflow-service#audit-log).

## Error Monitoring

Capture application errors, context and breadcrumbs; inspect grouped occurrences
and readable stacks in Traceflow. Install once in browser startup code:

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

Global JS errors and unhandled promise rejections are captured automatically.
Use `captureException()` for handled errors. The queue is in memory, so closing
a tab or terminating an app can lose pending events.

See the Error Monitoring guide for [Nuxt](ERROR_MONITORING.md#nuxt),
[React Native](ERROR_MONITORING.md#react-native),
[source maps](ERROR_MONITORING.md#upload-source-maps) and
[troubleshooting](ERROR_MONITORING.md#troubleshooting).

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

## Releasing (maintainers)

Update `js/package.json`, `js/package-lock.json` and `js/CHANGELOG.md` together,
then merge into `main`. **Release Deploy** publishes automatically when the npm
version increases. Changes to dependencies or other manifest fields without a
version change skip publishing. Invalid versions and version decreases fail.

For recovery after a failed publish, run the workflow with the committed version:

```sh
gh workflow run workflow.yaml --ref main -f version=2.8.0
```

The workflow tests and builds every entry point, installs and verifies the npm
archive, then publishes that same archive. It verifies npm's `latest` tag after
publishing. The existing `release/X.Y.Z` flow is also supported: commit version
`X.Y.Z` before pushing. The workflow does not bump versions or merge branches.

### One-time npm setup

In the package's npm settings, add a **Trusted Publisher** for GitHub Actions:

- Organization: `smartpricing`
- Repository: `traceflow-sdk`
- Workflow filename: `workflow.yaml`
- Environment: leave empty
- Allow `npm publish` and `npm dist-tag`

[Trusted publishing](https://docs.npmjs.com/trusted-publishers/) authenticates
through GitHub OIDC, so no npm write token or periodic token rotation is needed.
The workflow uses npm 11.21+ so it can verify private package tags through OIDC.
It does not change package visibility. The old `NO_TWOFA_NPM_TOKEN` secret is no
longer used.

To verify packaging locally, run from `js/`:

```sh
npm ci --ignore-scripts
npm run typecheck:errors
npm run test:release
npm test -- --run
npm run build
npm run test:package
```

The Kafka development dependency supplies types for the full build; its native
addon is not needed for these checks. React and Kafka remain optional peers for
SDK consumers.
