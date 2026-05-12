import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { useEffectiveRole } from '@/stores/roleViewStore';
import DriverHomePage from '@/pages/DriverHomePage';
import AgentHomePage from '@/pages/AgentHomePage';
import HomePage from '@/pages/HomePage';

/**
 * `/` — the route a signed-in user lands on. A driver and an agent have
 * genuinely different homes (one takes trips, one posts and shepherds them),
 * so we render the role-specific home; admins get the links hub. An admin can
 * use the `RoleSwitcher` at the top to view any of the three homes — `useEffectiveRole`
 * resolves their override (driver / trip_manager / admin) here and in `BottomNav`.
 */
export function HomeForRole() {
  const role = useEffectiveRole();
  return (
    <>
      <RoleSwitcher />
      {role === 'driver' ? <DriverHomePage /> : role === 'trip_manager' ? <AgentHomePage /> : <HomePage />}
    </>
  );
}

export default HomeForRole;
