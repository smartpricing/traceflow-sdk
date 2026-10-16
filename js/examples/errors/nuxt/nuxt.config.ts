import { fileURLToPath } from 'node:url';
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  sourcemap: { client: 'hidden', server: false },
  alias: { '@dev.smartpricing/traceflow-sdk/nuxt': fileURLToPath(new URL('../../../dist/nuxt.mjs', import.meta.url)) },
  runtimeConfig: { public: { errorEndpoint: 'http://127.0.0.1:13199/api/v1/client-errors', errorIngestKey: 'errors-local-public-key', errorSource: 'webapp', errorEnvironment: 'test', errorRelease: '1.0.0', errorDist: 'nuxt-example' } },
});
