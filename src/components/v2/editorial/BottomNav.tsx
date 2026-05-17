import { Link, useLocation } from 'react-router-dom';

const ITEMS: { to: string; label: string; match: (p: string) => boolean }[] = [
  { to: '/v5',               label: 'Cover',    match: (p) => p === '/v5' },
  { to: '/v5/trips',         label: 'Features', match: (p) => p.startsWith('/v5/trips') },
  { to: '/v5/notifications', label: 'Wire',     match: (p) => p.startsWith('/v5/notifications') },
  { to: '/v5/wallet',        label: 'Accounts', match: (p) => p.startsWith('/v5/wallet') },
  { to: '/v5/profile',       label: 'Masthead', match: (p) => p.startsWith('/v5/profile') },
];

/** v5 Editorial — bottom nav. Thin top rule, serif italic labels, no icons. */
export function EditorialBottomNav() {
  const { pathname, search } = useLocation();
  return (
    <nav
      aria-label="Editorial nav"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md justify-around border-t-2 border-foreground/70 bg-page px-3 pb-3 pt-2"
    >
      {ITEMS.map(({ to, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={to}
            to={`${to}${search}`}
            aria-current={active ? 'page' : undefined}
            className={`editorial-headline px-2 py-1 text-[13px] ${
              active
                ? 'border-b-2 border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default EditorialBottomNav;
