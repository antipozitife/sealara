import React, { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * Перехват ошибок рендера React → переход на `/error/500`.
 */
export class AppErrorBoundary extends Component<Props, { hasError: boolean }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary:", error, info.componentStack);
    if (!window.location.pathname.startsWith("/error")) {
      window.location.replace("/error/500");
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
