import { installNuxtErrors } from '@dev.smartpricing/traceflow-sdk/nuxt';
export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig().public;
  const reporting = installNuxtErrors(nuxtApp, { endpoint: config.errorEndpoint, ingestKey: config.errorIngestKey, source: config.errorSource, environment: config.errorEnvironment, release: config.errorRelease, dist: config.errorDist });
  reporting.client.setContext({ screen: 'error-example' });
  if (import.meta.hot) import.meta.hot.dispose(() => reporting.dispose());
  return { provide: { errorReporting: reporting.client } };
});
