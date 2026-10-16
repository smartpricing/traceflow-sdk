import { ErrorClient, cleanUrl } from "./errors/core";
import type { ErrorClientOptions } from "./errors/core";
export * from "./errors/core";

export function installBrowserErrors(
  options: Omit<ErrorClientOptions, "platform">,
  target: Window = window,
) {
  const client = new ErrorClient({ ...options, platform: "browser" });
  const page = () => {
    client.setContext({
      page: cleanUrl(target.location.href),
      ...(target.navigator
        ? {
            user_agent: target.navigator.userAgent,
            language: target.navigator.language,
          }
        : {}),
    });
  };
  const onError = (event: ErrorEvent) => {
    page();
    client.captureException(
      event.error ?? { name: "Error", message: event.message, stack: "" },
      {
        mechanism: "error",
        handled: false,
        ...(!event.error && event.filename && event.lineno
          ? {
              frames: [
                {
                  filename: cleanUrl(event.filename),
                  line: event.lineno,
                  column: Math.max(0, event.colno - 1),
                },
              ],
            }
          : {}),
      },
    );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    page();
    client.captureException(event.reason, {
      mechanism: "unhandledrejection",
      handled: false,
    });
  };
  const onNavigation = () => {
    page();
    client.addBreadcrumb({
      category: "navigation",
      message: cleanUrl(target.location.href),
    });
  };
  const onHidden = () => {
    if (target.document.visibilityState === "hidden") void client.flush(1000);
  };
  const onOnline = () => {
    void client.flush();
  };
  page();
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("popstate", onNavigation);
  target.addEventListener("hashchange", onNavigation);
  target.addEventListener("online", onOnline);
  target.document.addEventListener("visibilitychange", onHidden);
  return {
    client,
    dispose() {
      target.removeEventListener("error", onError);
      target.removeEventListener("unhandledrejection", onRejection);
      target.removeEventListener("popstate", onNavigation);
      target.removeEventListener("hashchange", onNavigation);
      target.removeEventListener("online", onOnline);
      target.document.removeEventListener("visibilitychange", onHidden);
      client.close();
    },
  };
}
