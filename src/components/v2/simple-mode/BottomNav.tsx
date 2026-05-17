import { Link, useLocation } from 'react-router-dom';
import { Home, Car, HelpCircle } from 'lucide-react';

/** v7 Simple Mode — bottom nav. 3 BIG tiles only, traffic-light borders. */
export function SimpleBottomNav() {
  const { pathname, search } = useLocation();
  const isActive = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return (
    <nav aria-label="Simple nav" className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-md grid-cols-3 gap-2 bg-page px-3 pb-3 pt-2">
      <Big to={`/v7${search}`}        active={pathname === '/v7'}   icon={<Home className="size-7" />}         label="Home" />
      <Big to={`/v7/trips${search}`}  active={isActive('/v7/trips')} icon={<Car className="size-7" />}          label="Trips" tone="go" />
      <Big to={`/v7/profile${search}`} active={isActive('/v7/profile')} icon={<HelpCircle className="size-7" />} label="Help" />
    </nav>
  );
}

function Big({
  to, active, icon, label, tone,
}: {
  to: string; active: boolean; icon: React.ReactNode; label: string; tone?: 'go';
}) {
  const isGo = tone === 'go';
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-card border-2 text-[13px] font-bold ${
        active
          ? isGo
            ? 'border-[var(--skin-simple-go)] bg-[var(--skin-simple-go)] text-white'
            : 'border-primary bg-primary text-primary-foreground'
          : isGo
            ? 'border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] text-[var(--skin-simple-go)]'
            : 'border-border bg-surface text-foreground'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

export default SimpleBottomNav;
