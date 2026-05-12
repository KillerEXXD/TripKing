import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Home, Plus, Search, User, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  to: string;
  /** Emphasised centre action (the ⊕ Post pill). */
  primary?: boolean;
  match: (path: string) => boolean;
}

// Driver and agent have genuinely different daily jobs, so the tab set follows the role.
const DRIVER_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home, to: '/', match: (p) => p === '/' },
  { id: 'browse', label: 'Browse', Icon: Search, to: '/trips', match: (p) => p === '/trips' || (p.startsWith('/trips/') && p !== '/trips/new') },
  { id: 'post', label: 'Post a trip', Icon: Plus, to: '/trips/new', primary: true, match: (p) => p === '/trips/new' },
  { id: 'mine', label: 'My trips', Icon: ClipboardList, to: '/posted-trips', match: (p) => p === '/posted-trips' },
  { id: 'profile', label: 'Profile', Icon: User, to: '/profile', match: (p) => p === '/profile' || p.startsWith('/drivers/') },
];
const AGENT_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home, to: '/', match: (p) => p === '/' },
  { id: 'post', label: 'Post a trip', Icon: Plus, to: '/trips/new', primary: true, match: (p) => p === '/trips/new' },
  { id: 'mine', label: 'My posts', Icon: ClipboardList, to: '/posted-trips', match: (p) => p === '/posted-trips' || p.endsWith('/applicants') },
  { id: 'find', label: 'Find driver', Icon: Users, to: '/vacancies', match: (p) => p.startsWith('/vacancies') },
];

/** Flow / detail screens are full-screen with their own back-bar + (sometimes) sticky CTA — no bottom nav. */
const HIDE_NAV = /^\/(trips\/(new|[^/]+)|drivers\/[^/]+|alerts\/(new|[^/]+)|vacancies\/new)$|^\/trips\/[^/]+\/applicants$/;

/**
 * The app's bottom navigation — fixed to the viewport bottom on the tab screens
 * (rendered by `AppLayout`). Hidden on flow / detail screens (post-trip wizard,
 * trip detail, applicant review, alerts new/detail, post-vacancy, driver
 * profile). The active tab and the tab set follow the path and the user's role.
 */
export function BottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (HIDE_NAV.test(pathname)) return null;
  const items = user?.role === 'trip_manager' ? AGENT_NAV : DRIVER_NAV;
  const activeId = items.find((it) => it.match(pathname))?.id;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t bg-white pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => {
        const isActive = it.id === activeId;
        if (it.primary) {
          return (
            <button key={it.id} type="button" onClick={() => navigate(it.to)} aria-label={it.label} aria-current={isActive ? 'page' : undefined} className="-mt-3 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                <it.Icon className="size-5" aria-hidden />
              </span>
              <span className="text-[10px] font-semibold text-primary">{it.label}</span>
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
            <it.Icon className="size-5" aria-hidden />
            <span className="text-[10px] font-medium">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
