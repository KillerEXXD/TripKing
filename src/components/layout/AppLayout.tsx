import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui';

/**
 * Shell for authed routes — a slim top bar over `<Outlet/>`.
 * The driver/agent bottom-nav and role-specific chrome land with the
 * marketplace screens (Phase 3).
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Link to="/" className="font-bold">
          TripKing
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user?.role === 'admin' ? (
            <Link to="/administration" className="text-secondary underline">
              Admin
            </Link>
          ) : null}
          <span className="text-secondary">{user?.displayName || user?.phone}</span>
          <Button size="sm" variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export default AppLayout;
