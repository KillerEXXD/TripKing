import { type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorState } from './ErrorState';

/**
 * Page-level error boundary — wrap a route element (or the `AppLayout` `<Outlet/>`)
 * with this so one broken page shows a recoverable panel instead of taking down
 * the whole shell. Resets automatically when the route changes.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const fallback = (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="w-full max-w-md space-y-3">
        <ErrorState title="This page hit a snag" message="Try again, or head back home." onRetry={() => window.location.reload()} />
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            Back to home
          </Button>
        </div>
      </div>
    </div>
  );
  return (
    <ErrorBoundary feature="route-render" resetKey={pathname} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}

export default RouteErrorBoundary;
