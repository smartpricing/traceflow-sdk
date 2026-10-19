# Traceflow Error Monitoring

Error Monitoring collects JavaScript errors from your applications. Each occurrence
contains the exception, stack, build, context and breadcrumbs. Traceflow groups
occurrences and uses private source maps to show the original code in the dashboard.

[Configure Traceflow](#configure-traceflow) · [Browser](#browser) · [Nuxt](#nuxt) ·
[React Native](#react-native) · [SDK options](#sdk-options) ·
[Source maps](#upload-source-maps) · [Troubleshooting](#troubleshooting)

## Configure Traceflow

Install the package in your application:

```sh
npm install @dev.smartpricing/traceflow-sdk
```

On the Traceflow backend, apply the client-error schema and configure ingestion
keys. The [backend setup](https://github.com/smartpricing/traceflow-service/blob/main/docs/CLIENT_ERRORS.md#enable-ingestion)
covers the schema, Redis and persistent source-map storage. The SDK does not create
keys or configure the service.

Set `CLIENT_ERROR_INGEST_KEYS` on the API process to a JSON array such as:

```json
[
  {
    "key": "public-webapp-ingestion-key",
    "source": "webapp",
    "environment": "production",
    "origins": ["https://app.example.com"],
    "events_per_minute": 600
  },
  {
    "key": "public-mobile-ingestion-key",
    "source": "mobile",
    "environment": "production",
    "allow_originless": true,
    "events_per_minute": 600
  }
]
```

Replace the example keys and origin. Browser origins must match exactly, including
scheme and port, with no path or trailing slash. React Native normally sends no
`Origin` header, so its key needs `allow_originless: true`. Use separate keys for
web and mobile. Keys for the same source/environment share one quota.

Ingestion keys are public and can only submit errors for their source/environment.
They cannot read events or upload source maps. Keep the private `X-API-Key` in the
backend or CI environment. Origin restrictions do not establish a user's identity.

## SDK options

All three adapters take these options. They set `platform` automatically.

| Required option | Example | Meaning |
| --- | --- | --- |
| `endpoint` | `https://traceflow.example.com/api/v1/client-errors` | Full ingestion URL, including the path |
| `ingestKey` | `public-webapp-ingestion-key` | Public key configured on the backend |
| `source` | `webapp` | Application name; must match the key |
| `environment` | `production` | Deployment environment; must match the key |
| `release` | `1.0.0` | Application release |
| `dist` | `android-build-42` | Unique identifier for the built files or OTA update |

Keep `dist` stable for one build. Change it when the generated code changes, even
if `release` stays the same. The app and its source-map upload must use identical
values. A Git commit can serve as `dist` only if it identifies the exact artifact;
use distinct values when platform, build configuration or OTA output differs.

| Optional option | Default | Use |
| --- | --- | --- |
| `context` | Diagnostic session ID only | Initial application context |
| `sampleRate` | `1` | Fraction captured, from `0` to `1` |
| `maxQueueSize` | `30` | In-memory event limit, from `1` to `100` |
| `beforeSend` | None | Synchronous function to redact or discard an event |
| `onDiagnostic` | None | Callback for delivery retries, drops and pauses |
| `fetch` | Runtime `fetch` | Custom transport with the same signature |

Import the adapters from their dedicated entry points, which avoid Node/Kafka
dependencies. Do not import the Node tracing client from frontend code.

## Browser

Create a module such as `src/error-monitoring.ts` and import it during client
startup. This also applies to browser assets served by Laravel.

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

reporting.client.setContext({ screen: 'quote-editor' });
reporting.client.addBreadcrumb({ category: 'action', message: 'Save quote' });

// Call from your application's save-error handler.
export function reportQuoteSaveFailure(error: unknown, quoteId: string) {
  reporting.client.captureException(error, { context: { quote_id: quoteId } });
}
```

Install once, early in application startup. A second `installBrowserErrors` call
on the same window returns the existing installation instead of duplicating
listeners; dispose it first to reinstall with different options. Calling it where
no `window` exists throws. Global errors and unhandled promise
rejections are captured without suppressing the browser's handlers. Page URLs,
user agent and language are included; query strings, fragments and URL credentials
are removed. Popstate/hash changes add navigation breadcrumbs. No form values,
cookies, request bodies, console output or HTTP responses are intercepted.

`dispose()` removes handlers and drops queued events. Call `await client.flush(2000)`
first if delivery is needed before disposal. A flush returns `false` if events
remain queued; it does not throw for transport failures.

## Nuxt

Declare the public client configuration in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  sourcemap: { client: 'hidden' },
  runtimeConfig: {
    public: {
      errorMonitoring: {
        endpoint: 'https://traceflow.example.com/api/v1/client-errors',
        ingestKey: '',
        source: 'webapp',
        environment: 'production',
        release: '',
        dist: '',
      },
    },
  },
});
```

Set `NUXT_PUBLIC_ERROR_MONITORING_INGEST_KEY`,
`NUXT_PUBLIC_ERROR_MONITORING_RELEASE` and `NUXT_PUBLIC_ERROR_MONITORING_DIST`
in the deployment environment. Other fields use the same prefix, for example
`NUXT_PUBLIC_ERROR_MONITORING_ENDPOINT`. All these values are public. For a static
deployment, supply them when generating the app. See [Nuxt runtime configuration](https://nuxt.com/docs/4.x/guide/going-further/runtime-config).

Create `plugins/traceflow.client.ts` under your Nuxt source directory (`app/` by
default in Nuxt 4):

```ts
import { installNuxtErrors } from '@dev.smartpricing/traceflow-sdk/nuxt';

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig().public.errorMonitoring;
  const reporting = installNuxtErrors(nuxtApp, config);
  if (import.meta.hot) import.meta.hot.dispose(() => reporting.dispose());
  return { provide: { errorReporting: reporting.client } };
});
```

In a component or composable, get the client through
`const { $errorReporting } = useNuxtApp()`. Its `captureException`, `setContext`
and `addBreadcrumb` methods are the same as the browser client's.

The adapter adds `vue:error`, `app:error` and `page:finish` hooks to browser capture.
An Error observed by more than one hook within one second produces one occurrence.
The plugin is client-only; Nuxt SSR errors are not captured. The configuration
above generates hidden client source maps.
Upload them from the build output before deployment and exclude `.map` files from
public hosting. See [Nuxt error hooks](https://nuxt.com/docs/4.x/getting-started/error-handling).

## React Native

```ts
import { AppState, Platform } from 'react-native';
import { installReactNativeErrors } from '@dev.smartpricing/traceflow-sdk/react-native';

export const reporting = installReactNativeErrors({
  endpoint: 'https://traceflow.example.com/api/v1/client-errors',
  ingestKey: 'public-mobile-ingestion-key',
  source: 'mobile', environment: 'production',
  release: '1.0.0', dist: 'android-build-42',
  context: { os: Platform.OS },
}, { appState: AppState, requireCoverage: ['globalErrors'] });
```

The adapter wraps the available `ErrorUtils` global handler, calls the previous
handler and restores it on disposal. `coverage.globalErrors` reports whether
that hook exists in the runtime. App state changes create breadcrumbs and request
a short flush when leaving the foreground. Set the current screen with
`client.setContext({ screen: routeName })` from your navigation listener.

Promise rejection hooks differ across React Native versions and engines. Pass
`subscribeUnhandledRejection(listener)`, returning an unsubscribe function, from
your runtime integration when available. `coverage.unhandledRejections` is false
without it. Set `requireCoverage: ['globalErrors', 'unhandledRejections']` in
the hooks argument to reject startup configuration that lacks a required hook;
failed installation restores the previous handler and removes subscriptions.
The SDK does not replace Hermes's rejection tracker or provide automatic
coverage without a compatible subscription. Handled promise failures
can always use `captureException`.

For render/lifecycle errors, use the [React boundary](#react-error-boundary).

Hermes `address at` frames retain their zero-based bytecode offset. Upload the
final composed Metro/Hermes source map from the exact Android/iOS build. Use a
new `dist` for each build and OTA update; the release version alone is insufficient.
Native crashes, native symbol files and delivery after process termination are
outside this JS adapter. See [React Native release symbolication](https://reactnative.dev/docs/debugging-release-builds).

## React error boundary

Wrap the relevant screen or application subtree. For React Native:

```tsx
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { TraceflowErrorBoundary } from '@dev.smartpricing/traceflow-sdk/react';
import { reporting } from './error-monitoring';

export function MonitoredScreen({ children, screen }: { children: ReactNode; screen: string }) {
  return (
    <TraceflowErrorBoundary
      client={reporting.client}
      fallback={<Text>Unable to display this screen.</Text>}
      resetKey={screen}
    >
      {children}
    </TraceflowErrorBoundary>
  );
}
```

React DOM uses the same boundary with a web fallback element. React 18+ is required.
The boundary records the component stack and shows `fallback` after a render or
lifecycle error. Changing `resetKey` renders the children again. Event-handler
errors and rejected promises need the runtime adapter or `captureException()`.

## Context and delivery

Use the installed client's methods from your application's handlers:

```ts
import { reporting } from './error-monitoring';

reporting.client.setContext({ screen: 'quote-editor', user_id: '42' });
reporting.client.addBreadcrumb({
  category: 'action', message: 'Save quote', data: { quote_id: '12345' },
});

// In a handler that has caught an error:
export function reportSaveError(error: unknown) {
  return reporting.client.captureException(error, {
    context: { quote_id: '12345', operation: 'save' },
  });
}

// On logout:
reporting.client.clearContext();
```

`captureException()` returns an event ID when queued, or `undefined` when skipped
or dropped. The ID is not a persistence receipt. Context passed to this call
applies only to that occurrence. The same Error object captured again within one
second reuses its ID instead of adding another occurrence.

`setContext` merges diagnostic fields; `clearContext` clears them and breadcrumbs
and starts a new diagnostic session ID. Call it on logout if user context was
added. The SDK does not infer a user identity. Breadcrumbs are limited to 50;
context values are depth/length bounded, circular-safe, and common secret keys
are replaced with `[Filtered]`.

Use `beforeSend(event)` to remove application-specific fields or return `null`
to discard an event. Generic masking does not recognize every secret or personal
value in free text. The hook is synchronous; a thrown exception drops that event.
`sampleRate` is 0–1, default 1, and sampling happens before queueing.

For example, add this option when installing the adapter:

```ts
import type { ErrorClientOptions } from '@dev.smartpricing/traceflow-sdk/browser';

const beforeSend: ErrorClientOptions['beforeSend'] = (event) => {
  delete event.context.guest_name;
  delete event.context.guest_phone;
  // Apply application-specific redaction to free text as well.
  event.exception.message = event.exception.message.replace(/booking-reference=\S+/g, 'booking-reference=[Filtered]');
  return event;
};
```

Redact breadcrumbs and stack text too if your app puts sensitive values there.
Do not send complete request/response objects as context.

The in-memory queue holds 30 events by default (`maxQueueSize`, maximum 100).
An event above 60 KB first loses its breadcrumbs, then its context and most of
its raw stack; `context.truncated` records what was removed. Only an exception
that is still too large is dropped. A full queue drops the new event. Frames
passed to `captureException` are validated and limited to 100 entries. Delivery
retries network failures, `408`, `429` and `5xx` up to five attempts, preserving
exact bytes and ID. It respects `Retry-After` and uses exponential backoff.
Events older than five minutes are discarded; other `4xx` responses are terminal.
A `401` or `403` means the key or origin is rejected for every event: queued
events are dropped and capture pauses for one minute, doubling up to 32 minutes
while rejections continue (`getStats().paused`, diagnostic type `paused`). The
pause ends on its own; fix the ingestion key or origin configuration.
`getStats()` returns sent, dropped, retried and queued counts, plus `droppedByReason`. An optional
`onDiagnostic` callback reports drops, retries and pauses without event payloads. Its
exceptions are ignored and error capture inside that callback is suppressed to
avoid recursion. No delivery failure creates another telemetry error.

Browser visibility changes request a flush with `keepalive`. Flush deadlines
apply even if a custom transport ignores abort; late replies are ignored. Closing
the client cancels its pending wait and accounts for queued events once.

This is best-effort delivery. Closing a tab, terminating an app, prolonged offline
use or fatal JS errors can lose queued events. There is no persistent offline queue.
Do not put a private `X-API-Key` in these clients: ingestion uses its own public,
source/environment-scoped key configured in Traceflow.

## Find and inspect errors

In the dashboard, open the errors view and select the source, environment and
time interval. Open a group to see its occurrences, then an occurrence to inspect
the exception, original/mapped frames, context and breadcrumbs. Read queries
accept intervals of at most 31 days; retention is configured on the backend.

A group is scoped to source/environment, platform, release and dist. The grouping
key uses the exception type and up to five generated stack frames. User IDs,
sessions and message text do not split groups when frames are available. Without
frames, normalized message text is used instead. Builds remain separate, so a
new `dist` creates new groups even for the same underlying bug.

Counts are exact up to 1,000 occurrences in the selected period. Above that, the
dashboard shows **at least 1,000** and omits the first-seen timestamp; individual
occurrences remain pageable. Uploading maps later improves the displayed stack
without changing the group or replaying events. Cross-build merging, issue
resolution, notifications and native crash collection are not implemented.

## Upload source maps

The package includes a Node CLI. Set `TRACEFLOW_API_KEY` as a private CI secret.
Upload after the build and before deploying its files:

```sh
npx traceflow-upload-map \
  --url https://traceflow.example.com \
  --source webapp --environment production \
  --release 1.0.0 --dist build-commit-or-ota-id --platform browser \
  --filename /_nuxt/app.js --map .output/public/_nuxt/app.js.map
```

Upload every generated chunk with its exact URL path. For mobile use
`--platform react-native --filename index.android.bundle` (or the filename in the
actual iOS stack) and the matching composed map. All identity fields must match
the event. Maps may be uploaded after an error; refreshing its detail resolves
the new map. Group membership remains build-scoped and unchanged.

For all Nuxt chunks, the equivalent Bash build step is:

```bash
set -euo pipefail
: "${TRACEFLOW_API_KEY:?Set the private upload key}"
: "${TRACEFLOW_RELEASE:?Set the same release as the app}"
: "${TRACEFLOW_DIST:?Set the same dist as the app}"

find .output/public/_nuxt -type f -name '*.js.map' -print0 |
  while IFS= read -r -d '' map; do
    filename="${map#.output/public}"
    npx traceflow-upload-map \
      --url https://traceflow.example.com \
      --source webapp --environment production --platform browser \
      --release "$TRACEFLOW_RELEASE" --dist "$TRACEFLOW_DIST" \
      --filename "${filename%.map}" --map "$map"
  done
```

For example, `.output/public/_nuxt/app.ABC.js.map` belongs to
`/_nuxt/app.ABC.js`. A CDN URL uses its actual path without host, query or fragment;
include any deployment prefix. There is no basename or nearest-build fallback.

Maps are immutable for a given build/file identity: uploading the same map again
is accepted, while different content returns `409`. Change `dist` for rebuilt
artifacts. The map limit is 10 MiB; indexed maps must embed their sections rather
than refer to external URLs. Include `sourcesContent` if you want code excerpts
in the dashboard. Keep maps private and retain them for builds still in use and
their event retention period. Event expiration does not delete source maps.

## Verify an installation

In a development or staging build, after installing the adapter:

```ts
import { reporting } from './error-monitoring';

const eventId = reporting.client.captureException(new Error('Error Monitoring setup check'), {
  context: { check: 'installation' },
});
const drained = await reporting.client.flush(2000);
console.log({ eventId, drained, stats: reporting.client.getStats() });
```

`drained: true` only means the queue is empty; rejected events also leave it. Check
that `sent` increased and find the occurrence in the dashboard using the configured
source/environment and current time interval. Then upload the matching map and
confirm a known source file and line. Trigger an unhandled JS error and promise
rejection separately to verify automatic capture.

The [Nuxt example](https://github.com/smartpricing/traceflow-sdk/blob/main/js/examples/errors/README.md) has buttons for Vue errors, unhandled
rejections and manual capture.

## Troubleshooting

Start with `reporting.client.getStats()`. It exposes `queued`, `sent`, `dropped`,
`retries`, `paused` and `droppedByReason`. For status codes, pass a diagnostic
callback when installing the adapter:

```ts
import type { ErrorClientOptions } from '@dev.smartpricing/traceflow-sdk/browser';

const onDiagnostic: ErrorClientOptions['onDiagnostic'] = (diagnostic) => {
  console.warn('Traceflow Error Monitoring delivery', diagnostic);
};
```

This callback receives delivery metadata, not the error payload. Route it to your
existing health logging if needed; do not call `captureException()` from it.

| Symptom | Check |
| --- | --- |
| `captureException()` returns `undefined` | Look at `droppedByReason`; check sampling, `beforeSend`, queue capacity, auth pause and disposal. A closed client does not capture. |
| `401` | The public ingestion key is missing or unknown. A private API key does not work here. |
| `403` | Compare source/environment with the key. Check the exact browser origin or mobile `allow_originless`. |
| `paused: true` | A `401`/`403` paused capture. Fix the configuration; the pause expires automatically, starting at one minute. Reinstall if changing client options. |
| `429` | The source/environment quota is exhausted. Retries respect `Retry-After`; the queue is bounded. |
| `503` or growing `retries` | Check network access and backend/Redis availability. A server operator can inspect the private diagnostics endpoint. |
| `400`, `409`, `410` or `413` | The event was rejected. Check custom `beforeSend` output, device clock, payload size and retained event age. These responses are terminal. |
| Browser network request blocked | Check CSP `connect-src`, HTTPS/mixed content, proxy CORS handling and extensions. Network failures may have no HTTP status. |
| Sent event absent from the view | Check source, environment and time filters. Group counts stop being exact above 1,000. |
| Map upload returns `409` | Different map content already exists for that build/file. Use the build's original map or a new `dist` for a new build. |
| Frame status `missing` | Check every identity field and the exact generated path; verify the map was uploaded and storage is mounted. |
| Frame status `unmapped` | A map exists but has no mapping at that coordinate. Check that it comes from the exact generated build. |
| Frame status `unavailable` | Map processing failed or was overloaded. Retry the detail read and check backend diagnostics. |
| No stack frames | Capture the original Error object where possible. A string message has no stack to map. |

Backend operators can use `GET /api/v1/client-errors/diagnostics` with a private
API key. See [service operations](https://github.com/smartpricing/traceflow-service/blob/main/docs/CLIENT_ERRORS.md#operations)
for counters, source-map storage and cleanup.

## Validate a mobile release

Hook availability is not proof that a runtime emits every error. Before enabling
this as the only reporter, test on each supported Android/iOS release build:

1. Trigger a global JS error, a rejected promise, and a React render failure.
   Confirm the corresponding mechanism, context and one occurrence in Traceflow.
2. Upload that build's composed map and verify a known source filename and line.
   Repeat after an OTA update with a different `dist`.
3. Test offline/reconnect, background/foreground, and a fatal JS error. The fatal
   hook starts delivery before invoking the previous handler, but process exit can
   still lose the event. Native crashes are not captured.
4. Verify required coverage flags, handler restoration on disposal, and delivery
   diagnostics when ingestion returns `429` or `503`.

The repository tests cover hook contracts, stack parsing, retries and cancellation.
They do not certify a specific React Native/Expo/Hermes version or physical device.
Run `npm run typecheck:errors`, `npm run test:errors`, and `npm run build:errors`
to check the frontend distributions without the optional native Kafka dependency.
