import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Card } from '@/components/ui';
import { InstallAppCard } from '@/components/layout/InstallAppCard';

/** Placeholder home — the role-specific driver/agent hubs land in Phase 3. */
export function HomePage() {
  const { user } = useAuth();
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <Card>
        <h1 className="text-xl font-bold">TripKing</h1>
        <p className="text-sm text-secondary">
          Signed in as <strong>{user?.displayName || user?.phone}</strong> ({user?.role}).
        </p>
        <p className="mt-2 text-sm text-secondary">
          More of the role-specific home hub arrives soon — for now, browse open trips or post one.
        </p>
        <div className="mt-3 flex gap-2">
          <Button asChild variant="full" className="flex-1">
            <Link to="/trips/new">Post a trip</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/trips">Browse trips</Link>
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link to="/posted-trips" className="text-primary underline">
            Your posted trips
          </Link>
          <Link to="/vacancies" className="text-primary underline">
            Available drivers
          </Link>
          <Link to="/alerts" className="text-primary underline">
            Trip alerts
          </Link>
          <Link to="/notifications" className="text-primary underline">
            Notifications
          </Link>
        </div>
      </Card>
      <InstallAppCard dismissable />
    </main>
  );
}

export default HomePage;
