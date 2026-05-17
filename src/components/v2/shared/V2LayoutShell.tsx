import { Outlet, useLocation } from 'react-router-dom';
import { RouteErrorBoundary } from '@/components/feedback';
import { SkinSwitcher } from './SkinSwitcher';
import { OperatorBottomNav } from '@/components/v2/operator-console/BottomNav';
import { FieldBottomNav } from '@/components/v2/field-companion/BottomNav';
import { PipelineBottomNav } from '@/components/v2/pipeline-board/BottomNav';
import { EditorialBottomNav } from '@/components/v2/editorial/BottomNav';
import { BharatBottomNav } from '@/components/v2/bharat-native/BottomNav';
import { SimpleBottomNav } from '@/components/v2/simple-mode/BottomNav';

import '@/styles/v2/tokens-operator-console.css';
import '@/styles/v2/tokens-field-companion.css';
import '@/styles/v2/tokens-pipeline-board.css';
import '@/styles/v2/tokens-editorial.css';
import '@/styles/v2/tokens-bharat-native.css';
import '@/styles/v2/tokens-simple-mode.css';

interface SkinMap {
  prefix: string;
  cls: string;
  Nav: React.ComponentType;
}

// Order matters — /v2 must not capture /v20+ in the future, hence exact + slash check.
const SKINS: SkinMap[] = [
  { prefix: '/v2', cls: 'v2-operator-console', Nav: OperatorBottomNav },
  { prefix: '/v3', cls: 'v2-field-companion',  Nav: FieldBottomNav },
  { prefix: '/v4', cls: 'v2-pipeline-board',   Nav: PipelineBottomNav },
  { prefix: '/v5', cls: 'v2-editorial',        Nav: EditorialBottomNav },
  { prefix: '/v6', cls: 'v2-bharat-native',    Nav: BharatBottomNav },
  { prefix: '/v7', cls: 'v2-simple-mode',      Nav: SimpleBottomNav },
];

function activeSkin(pathname: string): SkinMap | null {
  for (const s of SKINS) {
    if (pathname === s.prefix || pathname.startsWith(`${s.prefix}/`)) return s;
  }
  return null;
}

/**
 * Shell for /v2-/v7 prototype routes. Decoupled from v1 AppLayout (no v1
 * BottomNav). Renders:
 *   - sticky SkinSwitcher chip rail at top
 *   - the page outlet in the middle (padded to keep content clear of the nav)
 *   - the active skin's BottomNav at the bottom — each direction has its own
 *
 * Per-direction CSS-var overrides cascade from the `.v2-<direction>` wrapper
 * class, so every Tailwind utility (bg-page, bg-surface, etc.) re-skins per
 * route without parallel primitives.
 */
export function V2LayoutShell() {
  const location = useLocation();
  const skin = activeSkin(location.pathname);
  const Nav = skin?.Nav;
  const cls = skin ? `${skin.cls} bg-page text-foreground` : 'bg-page text-foreground';

  return (
    <div className={`min-h-dvh ${cls}`}>
      <SkinSwitcher />
      <main id="main" className={Nav ? 'pb-28' : ''}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      {Nav ? <Nav /> : null}
    </div>
  );
}

export default V2LayoutShell;
