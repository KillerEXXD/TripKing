import { useAuth } from '@/contexts/AuthContext';
import DriverHomePage from '@/pages/DriverHomePage';
import AgentHomePage from '@/pages/AgentHomePage';
import HomePage from '@/pages/HomePage';

/**
 * `/` — the route a signed-in user lands on. A driver and an agent have
 * genuinely different homes (one takes trips, one posts and shepherds them),
 * so we render the role-specific home; admins (and any other role) get the
 * links hub.
 */
export function HomeForRole() {
  const { user } = useAuth();
  if (user?.role === 'driver') return <DriverHomePage />;
  if (user?.role === 'trip_manager') return <AgentHomePage />;
  return <HomePage />;
}

export default HomeForRole;
