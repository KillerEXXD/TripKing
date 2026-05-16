import type { ComponentType, SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Home, Plus } from 'lucide-react';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { FindDriverIcon } from '@/components/icons/FindDriverIcon';
import { BrowseTripsIcon } from '@/components/icons/BrowseTripsIcon';
import { cn } from '@/lib/utils';
import './BottomNav.css';

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
  if (HIDE_NAV.test(pathname)) return null;
  const items = role === 'admin' ? ADMIN_NAV : role === 'trip_manager' ? AGENT_NAV : DRIVER_NAV;
  const activeId = items.find((it) => it.match(pathname))?.id;

  return (
    <nav
      aria-label="Primary"
      className="bottom-nav fixed inset-x-0 bottom-0 z-40 flex items-center justify-between overflow-visible pb-[env(safe-area-inset-bottom,0px)]"
    >
      {items.map((it) => {
        const isActive = it.id === activeId;
        if (it.primary) {
          // Centre FAB-as-button: gradient green square + "Post Trip" label.
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => navigate(it.to)}
              aria-label={it.ariaLabel ?? it.label}
              aria-current={isActive ? 'page' : undefined}
              className="bottom-nav-button flex flex-1 flex-col items-center justify-center gap-1 p-0"
            >
              <span className="bottom-nav-fab flex items-center justify-center">
                <it.Icon className="bottom-nav-icon--fab" width={16} height={16} strokeWidth={2} aria-hidden />
              </span>
              <span className="bottom-nav-label bottom-nav-label--fab">{it.label}</span>
            </button>
          );
        }
        // Inactive (flex-1) and active (auto-width green pill) share the same
        // stacked icon + label structure — only the wrapper-modifier class differs.
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => navigate(it.to)}
            aria-label={it.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'bottom-nav-button flex flex-col items-center justify-center gap-1',
              isActive ? 'bottom-nav-button--active' : 'bottom-nav-button--inactive',
            )}
          >
            <it.Icon
              className={isActive ? 'bottom-nav-icon--active' : 'bottom-nav-icon--inactive'}
              width={isActive ? 22 : it.iconSize.width}
              height={isActive ? 22 : it.iconSize.height}
              strokeWidth={isActive ? 2 : it.iconSize.strokeWidth}
              aria-hidden
            />
            <span
              className={cn(
                'bottom-nav-label',
                isActive ? 'bottom-nav-label--active' : 'bottom-nav-label--inactive',
              )}
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
