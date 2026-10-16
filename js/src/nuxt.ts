import { installBrowserErrors, cleanUrl } from "./browser";
import type { ErrorClientOptions } from "./errors/core";
export interface NuxtErrorHooks {
  hook(
    name: "vue:error" | "app:error",
    callback: (error: unknown) => void,
  ): () => void;
  hook(name: "page:finish", callback: () => void): () => void;
}
/** Call from a .client Nuxt plugin. No Nuxt or Node imports enter the browser bundle. */
export function installNuxtErrors(
  app: NuxtErrorHooks,
  options: Omit<ErrorClientOptions, "platform">,
) {
  const browser = installBrowserErrors(options);
  const remove = [
    app.hook("vue:error", (error) => {
      browser.client.captureException(error, {
        mechanism: "vue",
        handled: false,
      });
    }),
    app.hook("app:error", (error) => {
      browser.client.captureException(error, {
        mechanism: "nuxt",
        handled: false,
      });
    }),
    app.hook("page:finish", () => {
      const page = cleanUrl(window.location.href);
      browser.client.setContext({ page });
      browser.client.addBreadcrumb({ category: "navigation", message: page });
    }),
  ];
  return {
    client: browser.client,
    dispose() {
      remove.forEach((dispose) => dispose());
      browser.dispose();
    },
  };
}
