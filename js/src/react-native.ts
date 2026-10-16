import { ErrorClient } from "./errors/core";
import type { ErrorClientOptions } from "./errors/core";
export * from "./errors/core";
export type GlobalErrorHandler = (error: unknown, fatal?: boolean) => void;
export interface NativeErrorHooks {
  errorUtils?: {
    getGlobalHandler(): GlobalErrorHandler;
    setGlobalHandler(handler: GlobalErrorHandler): void;
  };
  appState?: {
    addEventListener(
      type: "change",
      listener: (state: string) => void,
    ): { remove(): void };
  };
  /** Runtime-specific subscription; return a function that restores the previous handler. */
  subscribeUnhandledRejection?: (
    listener: (reason: unknown) => void,
  ) => () => void;
}
export function installReactNativeErrors(
  options: Omit<ErrorClientOptions, "platform">,
  hooks: NativeErrorHooks = {},
) {
  const client = new ErrorClient({ ...options, platform: "react-native" });
  const errorUtils =
    hooks.errorUtils ??
    (
      globalThis as typeof globalThis & {
        ErrorUtils?: NativeErrorHooks["errorUtils"];
      }
    ).ErrorUtils;
  const previous = errorUtils?.getGlobalHandler();
  const handler: GlobalErrorHandler = (error, fatal) => {
    client.captureException(error, {
      mechanism: "react-native",
      handled: false,
      context: { fatal: Boolean(fatal) },
    });
    // Preserve React Native's crash/redbox behavior and any existing reporting hook.
    previous?.(error, fatal);
  };
  errorUtils?.setGlobalHandler(handler);
  const subscription = hooks.appState?.addEventListener("change", (state) => {
    client.addBreadcrumb({ category: "app", message: state });
    if (state !== "active") void client.flush(1000);
  });
  const unsubscribe = hooks.subscribeUnhandledRejection?.((reason) => {
    client.captureException(reason, {
      mechanism: "unhandledrejection",
      handled: false,
    });
  });
  return {
    client,
    coverage: {
      globalErrors: Boolean(errorUtils),
      unhandledRejections: Boolean(unsubscribe),
    },
    dispose() {
      if (errorUtils?.getGlobalHandler() === handler && previous)
        errorUtils.setGlobalHandler(previous);
      subscription?.remove();
      unsubscribe?.();
      client.close();
    },
  };
}
