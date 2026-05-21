import { Outlet } from 'react-router-dom';
import { BottomNav } from '@/components/layout/BottomNav';
import { RouteErrorBoundary } from '@/components/feedback';
import { BugReportFAB } from '@/components/bug/BugReportFAB';
import { IncomingOfferGate } from '@/components/dispatch/IncomingOfferModal';

/**
 * Shell for authed routes — the prototype's app frame: a soft-grey page over
 * `<Outlet/>` with a bottom nav. Pages render their own headers (greeting +
 * bell on the home, a back bar on detail screens). Sign-out and the admin
 * entry live on the Profile screen.
 *
 * Layout model: a `h-dvh flex flex-col` column where `<main>` is the scroll
 * container (`flex-1 overflow-y-auto`) and `<BottomNav>` is a natural-flow
 * sibling beneath it. Because `dvh` tracks the VISUAL viewport, the nav
 * always lands at the visible bottom edge — no fixed positioning, no
 * `visualViewport` JS, no `env(safe-area-inset-*)` chasing on the container.
 * This is the permanent fix for the recurring "nav clipped / gap below nav"
 * saga (PRs #216, #219, #224, #227 were band-aids on a fixed-position nav).
 *
 * The active page sits in the `<main>` landmark (the bottom nav is its own
 * `<nav>`); `<Outlet/>` is wrapped in a route-level error boundary so a crash
 * in one page shows a recoverable panel without taking down the shell / nav.
 */
export function AppLayout() {
  return (
    <div className="flex h-dvh flex-col bg-page">
      <main id="main" className="flex-1 overflow-y-auto">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      <BottomNav />
      <BugReportFAB />
      <IncomingOfferGate />
    </div>
  );
}

export default AppLayout;
