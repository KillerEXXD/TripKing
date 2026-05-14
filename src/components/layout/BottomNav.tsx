import type { ComponentType, SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Home, Plus } from 'lucide-react';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { FindDriverIcon } from '@/components/icons/FindDriverIcon';
import { BrowseTripsIcon } from '@/components/icons/BrowseTripsIcon';
import { cn } from '@/lib/utils';

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  id: string;
  label: string;
  Icon: NavIcon;
  to: string;
  /** Emphasised centre action (the ⊕ Post pill). */
  primary?: boolean;
  /** Render the icon at the larger 28 px size — used when the icon carries the
   *  full meaning so we drop the text label. */
  bigIcon?: boolean;
  /** Hide the text label below the icon. The bigger icon stands in for it. */
  hideLabel?: boolean;
  match: (path: string) => boolean;
}

// Driver and agent have genuinely different daily jobs, so the tab set follows the role.
// Profile lives in the top-right avatar (not the bottom nav), consistent across all 3 roles.
// Bottom nav reads as icon-only — the label stays on the NavItem for `aria-label`
// (screen readers + hover tooltips) but never renders as text. The bigger custom
// glyphs (BrowseTripsIcon, FindDriverIcon) carry the meaning visually.
const DRIVER_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home, to: '/', hideLabel: true, match: (p) => p === '/' },
  { id: 'browse', label: 'Find trips', Icon: BrowseTripsIcon, to: '/trips', bigIcon: true, hideLabel: true, match: (p) => p === '/trips' || (p.startsWith('/trips/') && p !== '/trips/new') },
  { id: 'post', label: 'Post a trip', Icon: Plus, to: '/trips/new', primary: true, hideLabel: true, match: (p) => p === '/trips/new' },
  { id: 'mine', label: 'My trips', Icon: ClipboardList, to: '/my-trips', hideLabel: true, match: (p) => p === '/my-trips' || p === '/posted-trips' },
];
const AGENT_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home, to: '/', hideLabel: true, match: (p) => p === '/' },
  { id: 'post', label: 'Post a trip', Icon: Plus, to: '/trips/new', primary: true, hideLabel: true, match: (p) => p === '/trips/new' },
  { id: 'mine', label: 'My posts', Icon: ClipboardList, to: '/posted-trips', hideLabel: true, match: (p) => p === '/posted-trips' || p.endsWith('/applicants') },
  { id: 'find', label: 'Find driver', Icon: FindDriverIcon, to: '/vacancies', bigIcon: true, hideLabel: true, match: (p) => p.startsWith('/vacancies') },
];
// Admins oversee the marketplace — they don't post or run trips, so no Post / My trips tabs.
const ADMIN_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home, to: '/', match: (p) => p === '/' },
  { id: 'browse', label: 'Find trips', Icon: BrowseTripsIcon, to: '/trips', bigIcon: true, hideLabel: true, match: (p) => p === '/trips' || (p.startsWith('/trips/') && p !== '/trips/new') },
  { id: 'find', label: 'Find driver', Icon: FindDriverIcon, to: '/vacancies', bigIcon: true, hideLabel: true, match: (p) => p.startsWith('/vacancies') },
  { id: 'alerts', label: 'Notifications', Icon: Bell, to: '/notifications', match: (p) => p.startsWith('/notifications') },
];

/** Flow / detail screens are full-screen with their own back-bar + (sometimes) sticky CTA — no bottom nav. */
const HIDE_NAV = /^\/(trips\/(new|[^/]+)|drivers\/[^/]+|alerts\/(new|[^/]+)|vacancies\/new)$|^\/trips\/[^/]+\/applicants$/;

/**
 * The app's bottom navigation — fixed to the viewport bottom on the tab screens
 * (rendered by `AppLayout`). Hidden on flow / detail screens (post-trip wizard,
 * trip detail, applicant review, alerts new/detail, post-vacancy, driver
 * profile). The active tab and the tab set follow the path and the effective role
 * (`useEffectiveRole` — an admin's `RoleSwitcher` choice, otherwise their real role).
 */
export function BottomNav() {
  const role = useEffectiveRole();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (HIDE_NAV.test(pathname)) return null;
  const items = role === 'admin' ? ADMIN_NAV : role === 'trip_manager' ? AGENT_NAV : DRIVER_NAV;
  const activeId = items.find((it) => it.match(pathname))?.id;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t bg-white pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {items.map((it) => {
        const isActive = it.id === activeId;
        if (it.primary) {
          return (
            <button key={it.id} type="button" onClick={() => navigate(it.to)} aria-label={it.label} aria-current={isActive ? 'page' : undefined} className="-mt-3 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                <it.Icon className="size-7" aria-hidden />
              </span>
              {it.hideLabel ? null : <span className="text-[10px] font-semibold text-primary">{it.label}</span>}
            </button>
          );
        }
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => navigate(it.to)}
            aria-label={it.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors', isActive ? 'text-primary' : 'text-secondary hover:text-foreground')}
          >
            <it.Icon className={it.bigIcon ? 'size-8' : 'size-7'} aria-hidden />
            {it.hideLabel ? null : <span className="text-[10px] font-medium">{it.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
