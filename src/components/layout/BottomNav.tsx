import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react';
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
 * The app's bottom navigation — fixed to the viewport bottom on tab screens.
 * Visual spec (frozen design): translucent white surface with a 24px backdrop
 * blur, layered double shadow, each item rendered as a stacked icon + label.
 * The active tab lifts into a soft-green pill; the Post-Trip slot is a
 * gradient green square (no circle, no translateY).
 *
 * Routing logic + per-role tab sets are unchanged from the previous version —
 * this is a styling-only refactor.
 */
export function BottomNav() {
  const role = useEffectiveRole();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);

  // Debug overlay — set `?navdbg=1` in the URL (or localStorage.navdbg=1) to
  // render a live measurement panel so we can compare Driver vs Agent without
  // opening the console. Triggered by query param so non-dev users never see it.
  const debugOn = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('navdbg') === '1'
    || window.localStorage?.getItem('navdbg') === '1'
  );
  const [dbg, setDbg] = useState<{
    role: string; innerH: number; vvH: number; vvTop: number; offset: number;
    navTop: number; navBottom: number; navHeight: number; ts: number;
  } | null>(null);

  // `position: fixed; bottom: 0` anchors to the LAYOUT viewport. Mobile
  // browsers (and Chrome DevTools' device emulator) inflate the layout
  // viewport by their bottom chrome (URL bar, etc.), so the nav can sit
  // 30–40px below the VISUAL viewport's bottom — clipping labels and the
  // primary FAB. Measured live: navBottom=967, visualViewport.height=932,
  // 35px clipped. Track the visual viewport and offset the nav so its
  // bottom always lands at the visible edge. Also handles the on-screen
  // keyboard pushing the nav up.
  useEffect(() => {
    const nav = navRef.current;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!nav || !vv) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      nav.style.bottom = `${offset}px`;
      if (debugOn) {
        // Read AFTER the bottom update lands so the rect reflects new position
        requestAnimationFrame(() => {
          const r = nav.getBoundingClientRect();
          setDbg({
            role,
            innerH: window.innerHeight,
            vvH: Math.round(vv.height * 100) / 100,
            vvTop: Math.round(vv.offsetTop * 100) / 100,
            offset,
            navTop: Math.round(r.top * 100) / 100,
            navBottom: Math.round(r.bottom * 100) / 100,
            navHeight: Math.round(r.height * 100) / 100,
            ts: Date.now(),
          });
        });
      }
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [debugOn, role]);

  if (HIDE_NAV.test(pathname)) return null;
  const items = role === 'admin' ? ADMIN_NAV : role === 'trip_manager' ? AGENT_NAV : DRIVER_NAV;
  const activeId = items.find((it) => it.match(pathname))?.id;

  // Critical styles go INLINE rather than via CSS classes. We've burned through
  // 4 attempts at fixing label-clipping via .bottom-nav rules and something in
  // the Tailwind v4 + workbox + Vercel chain keeps interfering. Inline styles
  // bypass ALL of that — they win every specificity battle and can't be cached
  // separately from the JSX. Visual + layout intent stays identical.
  // minHeight (not height) lets the nav grow to fit its content rather than
  // clip labels. The recurring "labels cut off" reports (5+ fixes in git
  // history) all stemmed from a fixed height + items-center: any pixel growth
  // in icon size, active-pill padding, or safe-area inset pushed the bottom
  // label row past the nav's hard bottom. minHeight removes the clip while
  // preserving the visual baseline; the extra 4px of bottom padding gives
  // labels predictable clearance from any home-indicator zone underneath.
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
    <>
      {debugOn && dbg ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 9999,
            background: 'rgba(15,23,42,0.92)',
            color: '#fff',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11px',
            lineHeight: 1.35,
            padding: '8px 10px',
            borderRadius: 6,
            maxWidth: 240,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            whiteSpace: 'pre',
          }}
        >
{`nav-dbg [${dbg.role}]
innerH      ${dbg.innerH}
vv.height   ${dbg.vvH}
vv.offsetTop ${dbg.vvTop}
→ bottom    ${dbg.offset}px
navRect.top    ${dbg.navTop}
navRect.bottom ${dbg.navBottom}
navRect.h      ${dbg.navHeight}
clipped?    ${dbg.navBottom > dbg.vvH + dbg.vvTop ? `YES (+${(dbg.navBottom - dbg.vvH - dbg.vvTop).toFixed(1)}px)` : 'no'}
url         ${typeof window !== 'undefined' ? window.location.pathname : ''}`}
        </div>
      ) : null}
    <nav
      ref={navRef}
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between overflow-visible"
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
    </>
  );
}

export default BottomNav;
