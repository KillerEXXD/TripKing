import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Plus, ClipboardList } from 'lucide-react';

/** v3 Field Companion — bottom nav. Big tap targets + sunrise-orange center FAB. */
export function FieldBottomNav() {
  const { pathname, search } = useLocation();
  const isActive = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return (
    <nav aria-label="Field nav" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-3 pb-3 pt-2">
      <div className="flex items-center justify-around rounded-card bg-surface px-2 py-2 shadow-card">
        <Tab to={`/v3${search}`} active={pathname === '/v3'} icon={<Home className="size-6" />} label="Home" />
        <Tab to={`/v3/trips${search}`} active={isActive('/v3/trips')} icon={<Search className="size-6" />} label="Find" />
        <FabLink to={`/v3/trips/new${search}`} />
        <Tab to={`/v3/my-trips${search}`} active={isActive('/v3/my-trips')} icon={<ClipboardList className="size-6" />} label="Trips" />
      </div>
    </nav>
  );
}

function Tab({ to, active, icon, label }: { to: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex w-16 flex-col items-center gap-0.5 rounded-control py-1 text-[11px] ${
        active ? 'text-primary font-bold' : 'text-muted-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function FabLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label="Post a new trip"
      className="grid size-14 -translate-y-3 place-items-center rounded-full bg-primary text-primary-foreground shadow-fab"
    >
      <Plus className="size-7" />
    </Link>
  );
}

export default FieldBottomNav;
