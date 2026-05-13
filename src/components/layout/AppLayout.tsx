import { Outlet } from 'react-router-dom';
import { BottomNav } from '@/components/layout/BottomNav';
import { RouteErrorBoundary } from '@/components/feedback';

/**
 * Shell for authed routes — the prototype's app frame: a soft-grey page over
 * `<Outlet/>` with the fixed bottom nav. Pages render their own headers
 * (greeting + bell on the home, a back bar on detail screens). Sign-out and
 * the admin entry live on the Profile screen.
 *
 * The active page sits in the `<main>` landmark (the bottom nav is its own
 * `<nav>`); `<Outlet/>` is wrapped in a route-level error boundary so a crash in
 * one page shows a recoverable panel without taking down the shell / nav.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-gray-50 pb-20">
      <main id="main">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}

export default AppLayout;
