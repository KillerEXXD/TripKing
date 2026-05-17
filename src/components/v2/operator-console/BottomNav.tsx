import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, List, ClipboardList, Wallet, Bell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ITEMS: { to: string; label: string; Icon: LucideIcon; match: (p: string) => boolean }[] = [
  { to: '/v2',               label: 'Home',  Icon: LayoutDashboard, match: (p) => p === '/v2' },
  { to: '/v2/trips',         label: 'Trips', Icon: List,            match: (p) => p.startsWith('/v2/trips') },
  { to: '/v2/my-trips',      label: 'Mine',  Icon: ClipboardList,   match: (p) => p.startsWith('/v2/my-trips') },
  { to: '/v2/wallet',        label: 'Wallet',Icon: Wallet,          match: (p) => p.startsWith('/v2/wallet') },
  { to: '/v2/notifications', label: 'Inbox', Icon: Bell,            match: (p) => p.startsWith('/v2/notifications') },
];

/** v2 Operator Console — bottom nav. Minimal monochrome row, no FAB. */
export function OperatorBottomNav() {
  const { pathname, search } = useLocation();
  return (
    <nav aria-label="Operator nav" className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md justify-around border-t border-border bg-surface px-2 py-1.5">
      {ITEMS.map(({ to, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={to}
            to={`${to}${search}`}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-control px-2 py-1 text-[10px] ${
              active ? 'text-foreground font-semibold' : 'text-muted-foreground'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            <span className="uppercase tracking-wide">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default OperatorBottomNav;
