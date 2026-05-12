import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureDataError } from '@/lib/sentry';
import { logger } from '@/lib/logger';
import { isChunkLoadError } from '@/lib/chunkError';
import { ErrorState } from './ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback; defaults to a full-height <ErrorState> with a reload button. */
  fallback?: ReactNode;
  /** Called after an error is caught + reported (chunk-load errors are excluded — those just reload). */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** When this value changes, the boundary clears its error state (e.g. pass the route path to recover on navigation). */
  resetKey?: string | number;
  /** Feature tag for Sentry — defaults to `react-render`. */
  feature?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors in its subtree, reports them to Sentry (with the React
 * component stack), and shows a recoverable fallback. Code-split chunk failures
 * are special-cased to a page reload (stale-deploy recovery).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Safety net for a chunk error that slipped past lazyWithRetry — reload to pick up the new bundle.
    if (isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
    logger.error('Render error caught by ErrorBoundary:', error, info.componentStack);
    captureDataError(this.props.feature ?? 'react-render', error, { componentStack: info.componentStack });
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private reload = (): void => window.location.reload();

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <div className="w-full max-w-md space-y-3">
          <ErrorState
            title="Something went wrong"
            message="The app hit an unexpected error. Reloading usually fixes it."
            onRetry={this.reload}
          />
          {import.meta.env.DEV && this.state.error ? (
            <details className="rounded-md bg-black/5 p-3 text-xs">
              <summary className="cursor-pointer font-medium">Error details (dev only)</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px] text-secondary">
                {this.state.error.message}
                {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
