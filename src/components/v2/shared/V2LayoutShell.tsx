import { Outlet, useLocation } from 'react-router-dom';
import { RouteErrorBoundary } from '@/components/feedback';
import { SkinSwitcher } from './SkinSwitcher';

import '@/styles/v2/tokens-operator-console.css';
import '@/styles/v2/tokens-field-companion.css';
import '@/styles/v2/tokens-pipeline-board.css';
import '@/styles/v2/tokens-editorial.css';
import '@/styles/v2/tokens-bharat-native.css';
import '@/styles/v2/tokens-simple-mode.css';

/** Map a /vN route to its token-scope wrapper class. */
function scopeClassFor(pathname: string): string {
  // Order matters — /v2 must not capture /v20+ in the future, hence exact + slash check.
  const map: { prefix: string; cls: string }[] = [
    { prefix: '/v2', cls: 'v2-operator-console' },
    { prefix: '/v3', cls: 'v2-field-companion' },
    { prefix: '/v4', cls: 'v2-pipeline-board' },
    { prefix: '/v5', cls: 'v2-editorial' },
    { prefix: '/v6', cls: 'v2-bharat-native' },
    { prefix: '/v7', cls: 'v2-simple-mode' },
  ];
  for (const { prefix, cls } of map) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return `${cls} bg-page text-foreground`;
    }
  }
  return 'bg-page text-foreground';
}

/**
 * Shell for /v2-/v6 prototype routes. Decoupled from v1 AppLayout (no
 * BottomNav, no BugReportFAB). Renders a sticky SkinSwitcher so the
 * viewer can hop between directions while looking at the same screen.
 *
 * Per-direction CSS-var overrides cascade from the `.v2-<direction>`
 * wrapper class, so every Tailwind utility (bg-page, bg-surface, etc.)
 * re-skins per route without parallel primitives.
 */
export function V2LayoutShell() {
  const location = useLocation();
  return (
    <div className={`min-h-dvh ${scopeClassFor(location.pathname)}`}>
      <SkinSwitcher />
      <main id="main">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  );
}

export default V2LayoutShell;
