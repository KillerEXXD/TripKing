import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureDataError } from '@/lib/sentry';
import { logger } from '@/lib/logger';
import { ErrorState } from './ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback; defaults to a full-page <ErrorState> with reload. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** App-level error boundary — catches render errors, reports to Sentry, shows a recoverable fallback. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Render error caught by ErrorBoundary:', error, info.componentStack);
    captureDataError('react-render', error, { componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <ErrorState
          title="Something went wrong"
          message="The app hit an unexpected error. Reloading usually fixes it."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
}

export default ErrorBoundary;
