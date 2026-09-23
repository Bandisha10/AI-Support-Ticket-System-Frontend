import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Button from "./Button";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface-bg p-6">
          <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-surface-card p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="mt-2 text-sm text-gray-400">
              An unexpected error occurred while rendering this page.
            </p>
            {this.state.error?.message && (
              <p className="mt-3 rounded-lg bg-surface-bg p-3 text-xs text-red-400 font-mono text-left break-words">
                {this.state.error.message}
              </p>
            )}
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button onClick={this.handleReset} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                <span>Reload Page</span>
              </Button>
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-bg px-4 py-2 text-sm font-semibold text-gray-300 hover:border-accent hover:text-white transition-colors"
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
