import { ErrorClient } from "./errors/core";
import type { ErrorClientOptions } from "./errors/core";
export * from "./errors/core";
export type GlobalErrorHandler = (error: unknown, fatal?: boolean) => void;
export interface NativeErrorHooks {
  /** Fail installation if these hooks are missing; previously installed handlers are restored. */
  requireCoverage?: ("globalErrors" | "unhandledRejections")[];
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
    // Start delivery before a fatal handler can terminate the JS runtime.
    // This remains best effort; there is no native crash spool.
    if (fatal) void client.flush(1000);
    previous?.(error, fatal);
  };
  let subscription: { remove(): void } | undefined;
  let unsubscribe: (() => void) | undefined;
  const dispose = () => {
    try {
      if (errorUtils?.getGlobalHandler() === handler && previous)
        errorUtils.setGlobalHandler(previous);
    } finally {
      try {
        subscription?.remove();
      } finally {
        try {
          unsubscribe?.();
        } finally {
          client.close();
        }
      }
    }
  };
  try {
    errorUtils?.setGlobalHandler(handler);
    subscription = hooks.appState?.addEventListener("change", (state) => {
      client.addBreadcrumb({ category: "app", message: state });
      if (state !== "active") void client.flush(1000);
    });
    unsubscribe = hooks.subscribeUnhandledRejection?.((reason) => {
      client.captureException(reason, {
        mechanism: "unhandledrejection",
        handled: false,
      });
    });
    const coverage = {
      globalErrors: Boolean(errorUtils),
      unhandledRejections: Boolean(unsubscribe),
    };
    const missing =
      hooks.requireCoverage?.filter((key) => !coverage[key]) ?? [];
    if (missing.length)
      throw new Error(
        "Missing React Native error hooks: " + missing.join(", "),
      );
    return { client, coverage, dispose };
  } catch (error) {
    try {
      dispose();
    } catch {
      /* Preserve the installation error. */
    }
    throw error;
  }
}
