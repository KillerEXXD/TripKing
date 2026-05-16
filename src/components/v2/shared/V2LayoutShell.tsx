import { Outlet, useLocation } from 'react-router-dom';
import { RouteErrorBoundary } from '@/components/feedback';

import '@/styles/v2/tokens-operator-console.css';
import '@/styles/v2/tokens-field-companion.css';
import '@/styles/v2/tokens-pipeline-board.css';

/** Map a /v2/<direction>/... route to its token-scope wrapper class. */
function scopeClassFor(pathname: string): string {
  if (pathname.startsWith('/v2/operator')) return 'v2-operator-console bg-page text-foreground';
  if (pathname.startsWith('/v2/field')) return 'v2-field-companion bg-page text-foreground';
  if (pathname.startsWith('/v2/pipeline')) return 'v2-pipeline-board bg-page text-foreground';
  return 'bg-page text-foreground';
}

/**
 * Alternative shell for /v2/* prototype routes. Decoupled from v1 AppLayout
 * (no BottomNav, no BugReportFAB) so the v2 chrome can be a per-direction
 * choice rather than inherited. CSS-var overrides cascade from the
 * `v2-<direction>` wrapper class so every Tailwind utility (bg-page,
 * bg-surface, text-foreground, etc.) re-skins automatically.
 */
export function V2LayoutShell() {
  const location = useLocation();
  return (
    <div className={`min-h-dvh ${scopeClassFor(location.pathname)}`}>
      <main id="main">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  );
}

export default V2LayoutShell;
