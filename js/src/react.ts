import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { ErrorClient } from "./errors/core";

export interface ErrorBoundaryProps {
  client: ErrorClient;
  children: ReactNode;
  fallback: ReactNode;
  resetKey?: string | number;
}
/** Covers render/lifecycle errors. Event-handler and promise errors use the runtime adapter. */
export class TraceflowErrorBoundary extends Component<
  ErrorBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.client.captureException(error, {
      handled: true,
      context: { component_stack: info.componentStack },
    });
  }
  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
