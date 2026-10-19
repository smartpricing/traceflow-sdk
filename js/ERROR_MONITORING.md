# Traceflow Error Monitoring

Capture JavaScript errors from web and mobile apps, with context, breadcrumbs
and source-mapped stacks. The [README](README.md#error-monitoring) has the browser
quickstart, also suitable for JavaScript served by Laravel.

## Configure Traceflow

Configure a public ingestion key for each source/environment on the backend.
Browser keys need the exact allowed origin, including scheme and port. Mobile
keys need `allow_originless: true`. See [backend setup](https://github.com/smartpricing/traceflow-service/blob/main/docs/CLIENT_ERRORS.md#enable-ingestion)
for the schema, keys and source-map storage.

The SDK uses a public `ingestKey`; private API keys stay in the backend or CI.
The ingestion URL must include `/api/v1/client-errors`.

## Nuxt

Declare client configuration in `nuxt.config.ts`:

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
in deployment, or at generation time for static apps. Other fields use the same
prefix. These values are public.

Create `plugins/traceflow.client.ts` under your Nuxt source directory:

```ts
import { installNuxtErrors } from '@dev.smartpricing/traceflow-sdk/nuxt';

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig().public.errorMonitoring;
  const reporting = installNuxtErrors(nuxtApp, config);
  if (import.meta.hot) import.meta.hot.dispose(() => reporting.dispose());
  return { provide: { errorReporting: reporting.client } };
});
```

Access the client with `const { $errorReporting } = useNuxtApp()`.
Browser, Vue and Nuxt client errors are captured; SSR errors are not.
A [runnable Nuxt example](https://github.com/smartpricing/traceflow-sdk/blob/main/js/examples/errors/README.md)
is included in the repository.

## React Native

Install before rendering the app, in a module such as `error-monitoring.ts`:

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
```

`requireCoverage` throws if the global JS error hook is unavailable. The adapter
preserves the previous handler and flushes on leaving the foreground.

Unhandled promise rejections require a runtime-specific
`subscribeUnhandledRejection(listener)` hook returning an unsubscribe function.
Without it, `reporting.coverage.unhandledRejections` is false. Add
`'unhandledRejections'` to `requireCoverage` when supplying that hook.
Native crashes are not captured. Use a new `dist` for each platform build and OTA
update, even when the release version stays the same.

### React error boundary

For render/lifecycle errors, wrap a screen or subtree (React 18+):

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

React DOM uses the same boundary with a web fallback. Changing `resetKey` retries
rendering. Event handlers and promise failures use the adapter or `captureException()`.

## Context and delivery

`client.setContext({ screen: 'quote-editor', user_id: '42' })` merges fields for
subsequent events. `captureException(error, { context: { quote_id: '12345' } })`
adds context to one occurrence. Call `client.clearContext()` on logout to clear
context and breadcrumbs and start a new diagnostic session.

Optional adapter settings:

| Option | Default | Purpose |
| --- | --- | --- |
| `context` | Session ID | Initial diagnostic fields |
| `sampleRate` | `1` | Capture fraction, from `0` to `1` |
| `maxQueueSize` | `30` | In-memory event limit, from `1` to `100` |
| `beforeSend(event)` | None | Redact data; return `null` to discard |
| `onDiagnostic(info)` | None | Observe drops, retries and auth pauses |
| `fetch` | Runtime `fetch` | Custom transport |

Common secret keys are masked, but free text can still contain sensitive data.
Use synchronous `beforeSend` for application-specific redaction, including
messages and breadcrumbs. Do not attach complete requests or responses.

Delivery retries network errors, `408`, `429` and `5xx` up to five attempts.
Events expire from the queue after five minutes. `401`/`403` drops queued events
and pauses capture for one minute, doubling on repeated rejection up to 32 minutes.
There is no persistent offline queue.

`captureException()` returns a queued event ID, not a persistence receipt.
`await client.flush(2000)` attempts delivery; `true` means the queue is empty,
including any dropped events. Check `client.getStats()` for `sent`, `dropped`,
`retries` and `droppedByReason`. `reporting.dispose()` removes hooks and drops
pending events, so flush first if needed.

## Upload source maps

Build with source maps, then upload each generated file's map before deployment.
Set `TRACEFLOW_API_KEY` as a private CI secret:

```sh
npx traceflow-upload-map \
  --url https://traceflow.example.com \
  --source webapp --environment production \
  --release 1.0.0 --dist build-commit-or-ota-id --platform browser \
  --filename /_nuxt/app.ABC.js --map .output/public/_nuxt/app.ABC.js.map
```

Use the actual generated path, including any deployment prefix, without host or
query string. Source, environment, release, dist and platform must match the app.
Maps are limited to 10 MiB; replacing a different map under the same identity
returns `409`. Use a new `dist` when generated code changes.

For React Native, use `--platform react-native` and the bundle filename from the
stack. Upload the final composed Metro/Hermes map from that exact build. See
[React Native source maps](https://reactnative.dev/docs/debugging-release-builds).
Keep maps out of public hosting and retain them for builds still in use.
Late uploads become available on the next detail read; no event replay is needed.

## Troubleshooting

Capture a test error, flush, confirm that `getStats().sent` increased, then find
it in the dashboard by source/environment and time. Upload its map and verify a
known source line. Test global errors, rejected promises and React render errors
separately on each supported Android/iOS release build, including OTA updates.
Fatal errors or process termination can prevent delivery.

Groups remain separate across builds. Counts above 1,000 show **at least 1,000**;
individual occurrences are still pageable. See [grouping behavior](https://github.com/smartpricing/traceflow-service/blob/main/docs/CLIENT_ERRORS.md#grouping-and-counts).

| Symptom | Check |
| --- | --- |
| No event | Inspect `getStats().droppedByReason` and `paused`; check sampling, `beforeSend`, disposal and network access. |
| `401` / `403` | Public key, source/environment, exact browser origin or mobile `allow_originless`. Capture resumes after the auth pause. |
| `429` / `503` | Quota or service availability. The SDK retries within its queue limits. |
| Map upload `409` | Existing map differs. Use the original artifact or a new build ID. |
| Frame `missing` / `unmapped` | Exact build identity, generated filename and map coordinates. |
| Frame `unavailable` | Retry the detail read; check [backend diagnostics](https://github.com/smartpricing/traceflow-service/blob/main/docs/CLIENT_ERRORS.md#operations). |

Use `onDiagnostic` to inspect delivery status codes without event payloads.
