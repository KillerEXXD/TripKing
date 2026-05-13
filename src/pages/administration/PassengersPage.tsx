import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { usePassengers } from '@/hooks/usePassengers';
import { Badge, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatShortDate, initials } from '@/lib/utils';
import type { Passenger } from '@/types';

function roleLabel(role: string): string {
  return role === 'trip_manager' ? 'Agent' : role === 'driver' ? 'Driver' : role === 'admin' ? 'Admin' : role;
}

function PassengerRow({ p }: { p: Passenger }) {
  return (
    <Card className="gap-1.5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary" aria-hidden>
          {p.name ? initials(p.name) : '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold">{p.name || 'Unnamed passenger'}</span>
            <Badge variant="muted">{p.tripsCount} trip{p.tripsCount === 1 ? '' : 's'}</Badge>
          </div>
          <div className="mt-0.5 font-mono text-xs text-secondary">{p.phone}</div>
          {p.aliases.length > 0 ? <div className="mt-0.5 text-xs text-secondary">also entered as: {p.aliases.join(', ')}</div> : null}
          <div className="mt-0.5 text-xs text-secondary">
            {p.referredBy ? (
              <>
                Added by <span className="font-medium text-foreground">{p.referredBy.displayName}</span>{' '}
                <Badge variant="outline" className="ml-0.5">
                  {roleLabel(p.referredBy.role)}
                </Badge>
              </>
            ) : p.referredByUserId ? (
              <>Added by an account that's since been removed</>
            ) : (
              <>Referrer not recorded</>
            )}
            {p.firstSeenAt ? ` · first seen ${formatShortDate(new Date(p.firstSeenAt))}` : ''}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * `/administration/passengers` — the passenger directory (admin-only). Every trip captures the
 * passenger's name + phone; the first trip to introduce a phone registers the passenger and
 * records who added them (the referrer; later trips with a different name append to `aliases`).
 * Read-only — `usePassengers` (newest first); the search box narrows the loaded list by name /
 * phone / alias client-side. Backed by `GET /passengers` (lands with the backend lane).
 */
export function PassengersPage() {
  const [q, setQ] = useState('');
  const passengersQuery = usePassengers({ limit: 200 });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = passengersQuery.data ?? [];
    if (!term) return list;
    return list.filter((p) => p.name.toLowerCase().includes(term) || p.phone.toLowerCase().includes(term) || p.aliases.some((a) => a.toLowerCase().includes(term)));
  }, [passengersQuery.data, q]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Passengers</h1>
      <p className="text-sm text-secondary">Auto-registered from posted trips, newest first. "Added by" is whoever first entered this phone number — your referral record.</p>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or alias" aria-label="Search passengers" />

      {passengersQuery.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : passengersQuery.isError ? (
        <ErrorState title="Couldn't load passengers" message="Check your connection and try again." onRetry={() => void passengersQuery.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users className="size-7" />} title="No passengers" message={q.trim() ? 'No passengers match that search.' : 'Passengers appear here once trips are posted with their details.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PassengerRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </main>
  );
}

export default PassengersPage;
