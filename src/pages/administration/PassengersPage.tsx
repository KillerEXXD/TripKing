import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { useInfinitePassengers } from '@/hooks/usePassengers';
import { Badge, Button, Card, Input } from '@/components/ui';
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

const PAGE_SIZE = 50;

/**
 * `/administration/passengers` — passenger directory (admin-only). Server-paginated via
 * `useInfinitePassengers` (50/page), IntersectionObserver auto-fetches the next page,
 * header shows the server total. The search box narrows the loaded set client-side.
 */
export function PassengersPage() {
  const [q, setQ] = useState('');
  const passengersQuery = useInfinitePassengers(undefined, PAGE_SIZE);

  const rows = useMemo(() => (passengersQuery.data?.pages.flatMap((p) => p.data) ?? []), [passengersQuery.data]);
  const total = passengersQuery.data?.pages[0]?.meta.total;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((p) => p.name.toLowerCase().includes(term) || p.phone.toLowerCase().includes(term) || p.aliases.some((a) => a.toLowerCase().includes(term)));
  }, [rows, q]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !passengersQuery.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !passengersQuery.isFetchingNextPage) void passengersQuery.fetchNextPage();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [passengersQuery]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Passengers</h1>
        {typeof total === 'number' ? <span className="text-sm text-secondary">{total.toLocaleString('en-IN')} total</span> : null}
      </div>
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
          <div ref={sentinelRef} aria-hidden className="h-1" />
          {passengersQuery.isFetchingNextPage ? <LoadingSkeleton rows={2} /> : null}
          {!passengersQuery.hasNextPage && rows.length > PAGE_SIZE ? (
            <p className="py-2 text-center text-xs text-secondary">— end of list ({rows.length.toLocaleString('en-IN')} loaded) —</p>
          ) : null}
          {passengersQuery.hasNextPage && !passengersQuery.isFetchingNextPage ? (
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="outline" onClick={() => void passengersQuery.fetchNextPage()}>Load more</Button>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default PassengersPage;
