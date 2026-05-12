import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui';
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
          Marketplace screens (post / browse / apply / assign / OTP) arrive in Phase 3 — see{' '}
          <code>docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md</code>.
        </p>
      </Card>
      <InstallAppCard dismissable />
    </main>
  );
}

export default HomePage;
