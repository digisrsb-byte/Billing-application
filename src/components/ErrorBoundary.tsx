import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches React render errors. Does not clear storage or reset the database.
 * User-facing copy omits stack traces, secrets, and filesystem paths.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Log only safe metadata for operators — never put stack/paths in UI.
    console.error('Render error caught by ErrorBoundary', error?.name || 'Error');
  }

  /**
   * Applies the same state transition React uses when a descendant throws
   * during render. Used by Phase 2C tests to prove the catch path without
   * requiring a browser DOM.
   */
  captureDescendantRenderError(error: Error, info?: ErrorInfo): void {
    const next = ErrorBoundary.getDerivedStateFromError(error);
    this.state = next;
    this.componentDidCatch(error, info || { componentStack: '' });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-[#F5F7FA] p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900 m-0">Something went wrong</h1>
            <p className="text-sm text-slate-600 m-0 leading-relaxed">
              The screen hit an unexpected error. Your saved billing data was not cleared. Try again, or
              reload the app. If this keeps happening, use Settings → Backup &amp; recovery to export a
              backup, then sign out and sign back in.
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-3.5 py-2 text-sm font-semibold rounded-xl bg-slate-100 text-slate-700 cursor-pointer"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-3.5 py-2 text-sm font-bold rounded-xl bg-[#1F7A63] text-white cursor-pointer"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
