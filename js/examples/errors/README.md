# Traceflow Error Monitoring examples

Build the frontend SDK first with `npm run build:errors` in `js/`.

The Nuxt example is a standalone application inside this repository:

```sh
cd examples/errors/nuxt
npm install
npm run build
PORT=13201 npm run preview
```

Configure the `NUXT_PUBLIC_ERROR_*` variables to match the ingestion key, source,
environment, release and build configured in your local Traceflow service. The
example defaults target `http://127.0.0.1:13199`, source `webapp`, environment `test`.
Allow `http://localhost:13201` or `http://127.0.0.1:13201` as the ingestion origin,
matching the URL you use to open the example.

The three buttons exercise Vue capture, an unhandled promise rejection and manual
capture. Each click should add one occurrence. Upload each map in
`.output/public/_nuxt` with filename `/_nuxt/<chunk>.js`, release `1.0.0`, build
`nuxt-example`, and platform `browser`; the original `.vue` line appears in the
dashboard after refreshing the occurrence. Do not serve these maps publicly in
an application deployment.

React Native setup is in [the integration guide](../../ERROR_MONITORING.md#react-native). The adapter unit tests cover
ErrorUtils chaining, subscription cleanup, and Hermes/JSC/V8 stack coordinates.
They do not replace release-build testing on the consuming app's iOS/Android
engine and OTA configuration.
