import { Outlet } from 'react-router-dom';
import { BottomNav } from '@/components/layout/BottomNav';

/**
 * Shell for authed routes — the prototype's app frame: a soft-grey page over
 * `<Outlet/>` with the fixed bottom nav. Pages render their own headers
 * (greeting + bell on the home, a back bar on detail screens). Sign-out and
 * the admin entry live on the Profile screen.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-gray-50 pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}

export default AppLayout;
