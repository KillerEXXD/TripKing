import { type ComponentType, type SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Home, Plus } from 'lucide-react';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { FindDriverIcon } from '@/components/icons/FindDriverIcon';
import { BrowseTripsIcon } from '@/components/icons/BrowseTripsIcon';

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface IconSize {
  width: number;
  height: number;
  strokeWidth: number;
}

interface NavItem {
  id: string;
  /** Visible text under the icon — Title Case per the redesign spec. */
  label: string;
  /**
   * Screen-reader label — sometimes differs from the visible label
   * (e.g. driver display "Find Trips" vs aria "Find trips" /
   * "Post Trip" vs "Post a trip"). Falls back to `label` when omitted.
   */
  ariaLabel?: string;
  Icon: NavIcon;
  to: string;
  /** Emphasised centre action — renders the gradient green-square FAB. */
  primary?: boolean;
  /** Inactive-state size — each icon picks its own to balance stroke
   *  weight + artwork complexity per the redesign spec. The active state
   *  ignores this and renders every icon at 22×22 / strokeWidth 2. */
  iconSize: IconSize;
  match: (path: string) => boolean;
}

// Redesign labels (UI_REDESIGN_PLAN.md + the BottomNav spec): each tab
// shows its label BELOW the icon. Driver and agent share the same 4-slot
// layout (Home · contextual · + · My); admins keep their 4-tab oversight
// layout but adopt the same visuals.
const DRIVER_NAV: NavItem[] = [
  { id: 'home',   label: 'Home',        ariaLabel: 'Home',         Icon: Home,             to: '/',          iconSize: { width: 24, height: 24, strokeWidth: 1.9 }, match: (p) => p === '/' },
  { id: 'browse', label: 'Find Trips',  ariaLabel: 'Find trips',   Icon: BrowseTripsIcon,  to: '/trips',     iconSize: { width: 28, height: 28, strokeWidth: 1.6 }, match: (p) => p === '/trips' || (p.startsWith('/trips/') && p !== '/trips/new') },
  { id: 'post',   label: 'Post Trip',   ariaLabel: 'Post a trip',  Icon: Plus,             to: '/trips/new', primary: true, iconSize: { width: 16, height: 16, strokeWidth: 2 }, match: (p) => p === '/trips/new' },
  { id: 'mine',   label: 'My Trips',    ariaLabel: 'My trips',     Icon: ClipboardList,    to: '/my-trips',  iconSize: { width: 26, height: 26, strokeWidth: 1.8 }, match: (p) => p === '/my-trips' || p === '/posted-trips' },
];
const AGENT_NAV: NavItem[] = [
  { id: 'home', label: 'Home',        ariaLabel: 'Home',          Icon: Home,            to: '/',          iconSize: { width: 24, height: 24, strokeWidth: 1.9 }, match: (p) => p === '/' },
  { id: 'find', label: 'Find Driver', ariaLabel: 'Find driver',   Icon: FindDriverIcon,  to: '/vacancies', iconSize: { width: 28, height: 28, strokeWidth: 1.6 }, match: (p) => p.startsWith('/vacancies') },
  { id: 'post', label: 'Post Trip',   ariaLabel: 'Post a trip',   Icon: Plus,            to: '/trips/new', primary: true, iconSize: { width: 16, height: 16, strokeWidth: 2 }, match: (p) => p === '/trips/new' },
  { id: 'mine', label: 'My Posts',    ariaLabel: 'My posts',      Icon: ClipboardList,   to: '/posted-trips', iconSize: { width: 26, height: 26, strokeWidth: 1.8 }, match: (p) => p === '/posted-trips' || p.endsWith('/applicants') },
];
const ADMIN_NAV: NavItem[] = [
  { id: 'home',   label: 'Home',        ariaLabel: 'Home',          Icon: Home,            to: '/',              iconSize: { width: 24, height: 24, strokeWidth: 1.9 }, match: (p) => p === '/' },
  { id: 'browse', label: 'Find Trips',  ariaLabel: 'Find trips',    Icon: BrowseTripsIcon, to: '/trips',         iconSize: { width: 28, height: 28, strokeWidth: 1.6 }, match: (p) => p === '/trips' || (p.startsWith('/trips/') && p !== '/trips/new') },
  { id: 'find',   label: 'Find Driver', ariaLabel: 'Find driver',   Icon: FindDriverIcon,  to: '/vacancies',     iconSize: { width: 28, height: 28, strokeWidth: 1.6 }, match: (p) => p.startsWith('/vacancies') },
  { id: 'alerts', label: 'Alerts',      ariaLabel: 'Notifications', Icon: Bell,            to: '/notifications', iconSize: { width: 24, height: 24, strokeWidth: 1.9 }, match: (p) => p.startsWith('/notifications') },
];

/** Flow / detail screens are full-screen with their own back-bar + (sometimes) sticky CTA — no bottom nav. */
const HIDE_NAV = /^\/(trips\/(new|[^/]+)|drivers\/[^/]+|alerts\/(new|[^/]+)|vacancies\/new)$|^\/trips\/[^/]+\/applicants$/;

/**
 * The app's bottom navigation — a NATURAL-FLOW sibling beneath the
 * scrollable `<main>` inside `AppLayout`. NOT `position: fixed`.
 *
 * Why not fixed: `position: fixed; bottom: 0` anchors to the LAYOUT viewport,
 * which mobile browsers (and Chrome DevTools' device emulator) inflate by
 * their bottom chrome. That left the nav 30-40px below the VISUAL viewport,
 * clipping labels and the primary FAB. We tried five band-aids — last one
 * tracked `window.visualViewport` and set `bottom` dynamically with rAF +
 * timeout cascades + pathname-keyed re-measurement. None held in every
 * combination of browser × on-screen-keyboard × URL-bar state.
 *
 * The permanent fix: AppLayout is a `h-dvh flex flex-col` column. `<main>` is
 * the scroll container; this nav is its sibling. `dvh` tracks the visual
 * viewport, so the column always equals the visible viewport height, and the
 * flex layout always positions the nav last — at the visible bottom edge.
 * No JS, no `env(safe-area-inset-*)` chasing on the container, no race
 * conditions. The home-indicator zone on real iOS is still cleared by the
 * `padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))` below.
 *
 * Visual spec (frozen design): translucent white surface with a 24px backdrop
 * blur, layered double shadow, each item rendered as a stacked icon + label.
 * The active tab lifts into a soft-green pill; the Post-Trip slot is a
 * gradient green square (no circle, no translateY).
 */
export function BottomNav() {
  const role = useEffectiveRole();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (HIDE_NAV.test(pathname)) return null;
  const items = role === 'admin' ? ADMIN_NAV : role === 'trip_manager' ? AGENT_NAV : DRIVER_NAV;
  const activeId = items.find((it) => it.match(pathname))?.id;

  // Critical styles go INLINE rather than via CSS classes. We've burned through
  // 4 attempts at fixing label-clipping via .bottom-nav rules and something in
  // the Tailwind v4 + workbox + Vercel chain keeps interfering. Inline styles
  // bypass ALL of that — they win every specificity battle and can't be cached
  // separately from the JSX.
  // minHeight (not height) lets the nav grow to fit its content rather than
  // clip labels if the active-pill padding or icon sizes grow.
  const navStyle = {
    background: 'rgba(255, 255, 255, 0.98)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: '0 -1px 0 rgba(0,0,0,0.05), 0 -6px 20px rgba(0,0,0,0.05)',
    paddingTop: '10px',
    paddingRight: '20px',
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    paddingLeft: '20px',
    minHeight: 'calc(96px + env(safe-area-inset-bottom, 0px))',
    boxSizing: 'border-box' as const,
  };
  const labelBase = {
    fontSize: '11px',
    lineHeight: 1.1,
    whiteSpace: 'nowrap' as const,
    letterSpacing: '-0.1px',
  };

  return (
    <nav
      aria-label="Primary"
      className="z-40 flex items-center justify-between overflow-visible"
      style={navStyle}
    >
      {items.map((it) => {
        const isActive = it.id === activeId;
        if (it.primary) {
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => navigate(it.to)}
              aria-label={it.ariaLabel ?? it.label}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 border-0 bg-transparent p-0"
            >
              <span
                className="flex items-center justify-center"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.4)',
                }}
              >
                <it.Icon width={16} height={16} strokeWidth={2} style={{ color: '#ffffff' }} aria-hidden />
              </span>
              <span style={{ ...labelBase, fontWeight: 600, color: '#10b981' }}>{it.label}</span>
            </button>
          );
        }
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => navigate(it.to)}
            aria-label={it.ariaLabel ?? it.label}
            aria-current={isActive ? 'page' : undefined}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 border-0 bg-transparent"
            style={
              isActive
                ? { background: '#ecfdf5', borderRadius: '14px', padding: '8px 14px', flex: '0 0 auto' }
                : { borderRadius: '12px', padding: '6px 4px', flex: '1 1 0' }
            }
          >
            <it.Icon
              width={isActive ? 22 : it.iconSize.width}
              height={isActive ? 22 : it.iconSize.height}
              strokeWidth={isActive ? 2 : it.iconSize.strokeWidth}
              style={{ color: isActive ? '#10b981' : '#94a3b8' }}
              aria-hidden
            />
            <span
              style={{
                ...labelBase,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#10b981' : '#64748b',
              }}
            >
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
