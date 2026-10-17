# Browser and React Native errors

Use the dedicated entry points. They do not import the Node tracing client,
Kafka or Node built-ins. Existing imports from the package root are unchanged.

## Browser, including JavaScript served by Laravel

```ts
import { installBrowserErrors } from '@dev.smartpricing/traceflow-sdk/browser';

const reporting = installBrowserErrors({
  endpoint: 'https://traceflow.example.com/api/v1/client-errors',
  ingestKey: 'public-webapp-ingestion-key',
  source: 'webapp',
  environment: 'production',
  release: '1.0.0',
  dist: 'build-commit-or-ota-id',
});

reporting.client.setContext({ screen: 'quote-editor' });
reporting.client.addBreadcrumb({ category: 'action', message: 'Save quote' });
try {
  await saveQuote();
} catch (error) {
  reporting.client.captureException(error);
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

Install from a `.client.ts` plugin:

```ts
import { installNuxtErrors } from '@dev.smartpricing/traceflow-sdk/nuxt';

export default defineNuxtPlugin((nuxtApp) => {
  const reporting = installNuxtErrors(nuxtApp, {
    endpoint: 'https://traceflow.example.com/api/v1/client-errors',
    ingestKey: 'public-webapp-ingestion-key',
    source: 'webapp', environment: 'production',
    release: '1.0.0', dist: 'build-commit-or-ota-id',
  });
  if (import.meta.hot) import.meta.hot.dispose(() => reporting.dispose());
  return { provide: { errorReporting: reporting.client } };
});
```

The adapter adds `vue:error`, `app:error` and `page:finish` hooks to browser capture.
An Error observed by more than one hook within one second produces one occurrence.
The plugin is client-only; Nuxt SSR errors are not captured. Generate private
client source maps with `sourcemap: { client: 'hidden' }` in `nuxt.config.ts`.
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
}, { appState: AppState });
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
failed installation restores the previous handler and removes subscriptions. The SDK does not replace Hermes's rejection tracker or claim automatic
coverage where no compatible subscription is supplied. Handled promise failures
can always use `captureException`.

For render/lifecycle errors, wrap the application in `TraceflowErrorBoundary` from
`@dev.smartpricing/traceflow-sdk/react`. It takes `client`, `fallback`, `children`
and an optional `resetKey`. React 18+ is an optional peer dependency; the boundary
works with React DOM or React Native. Event-handler errors use the runtime adapter.

Hermes `address at` frames retain their zero-based bytecode offset. Upload the
final composed Metro/Hermes source map from the exact Android/iOS build. Use a
new `dist` for each build and OTA update; the release version alone is insufficient.
Native crashes, native symbol files and delivery after process termination are
outside this JS adapter. See [React Native release symbolication](https://reactnative.dev/docs/debugging-release-builds).

## Context and delivery

`setContext` merges diagnostic fields; `clearContext` clears them and breadcrumbs
and starts a new diagnostic session ID. Call it on logout if user context was
added. The SDK does not infer a user identity. Breadcrumbs are limited to 50;
context values are depth/length bounded, circular-safe, and common secret keys
are replaced with `[Filtered]`.

Use `beforeSend(event)` to remove application-specific fields or return `null`
to discard an event. Generic masking does not recognize every secret or personal
value in free text. The hook is synchronous; a thrown exception drops that event.
`sampleRate` is 0–1, default 1, and sampling happens before queueing.

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
pause ends on its own; fix the ingestion key or origin configuration. `getStats()` returns
sent, dropped, retried and queued counts, plus `droppedByReason`. An optional
`onDiagnostic` callback reports drops, retries and pauses without event payloads. Its
exceptions are ignored and error capture inside that callback is suppressed to
avoid recursion. Use a separate health channel to monitor delivery losses. No delivery failure creates another
telemetry error. Browser visibility changes request a flush with `keepalive`. Flush deadlines
apply even if a custom transport ignores abort; late replies are ignored. Closing
the client cancels its pending wait and accounts for queued events once.

This is best-effort delivery. Closing a tab, terminating an app, prolonged offline
use or fatal JS errors can lose queued events. There is no persistent offline queue.
Do not put a private `X-API-Key` in these clients: ingestion uses its own public,
source/environment-scoped key configured in Traceflow.

## Upload source maps

The package includes a Node CLI. Set the private key in the build environment:

```sh
export TRACEFLOW_API_KEY='private-build-upload-key'
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
