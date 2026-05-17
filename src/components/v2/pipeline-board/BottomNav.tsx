import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, Columns3, Wallet, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ITEMS: { to: string; label: string; Icon: LucideIcon; tint: string; match: (p: string) => boolean }[] = [
  { to: '/v4',          label: 'Overview', Icon: LayoutGrid, tint: 'in_progress',    match: (p) => p === '/v4' },
  { to: '/v4/trips',    label: 'Board',    Icon: Columns3,   tint: 'has_applicants', match: (p) => p.startsWith('/v4/trips') },
  { to: '/v4/wallet',   label: 'Wallet',   Icon: Wallet,     tint: 'assigned',       match: (p) => p.startsWith('/v4/wallet') },
  { to: '/v4/profile',  label: 'Account',  Icon: User,       tint: 'completed',      match: (p) => p.startsWith('/v4/profile') },
];

/** v4 Pipeline Board — bottom nav. Pastel pill on active tab, matching kanban-column tints. */
export function PipelineBottomNav() {
  const { pathname, search } = useLocation();
  return (
    <nav aria-label="Pipeline nav" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-3 pb-3 pt-2">
      <div className="flex items-center justify-around rounded-card bg-surface px-2 py-1.5 shadow-card">
        {ITEMS.map(({ to, label, Icon, tint, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={to}
              to={`${to}${search}`}
              data-tint={active ? tint : undefined}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-pill px-2 py-1.5 text-[11px] ${
                active ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              <Icon className="size-5" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default PipelineBottomNav;
