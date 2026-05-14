import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Car, Users } from 'lucide-react';
import { useInfiniteDrivers } from '@/hooks/useDrivers';
import { Badge, Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatRating, initials } from '@/lib/utils';
import { BugReporterToggle } from '@/components/bug/BugReporterToggle';
import type { Driver, KycStatus } from '@/types';

const KYC_BADGE: Record<KycStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  pending: { label: 'Pending', variant: 'muted' },
  docs_submitted: { label: 'Docs in', variant: 'info' },
  video_pending: { label: 'Video pending', variant: 'info' },
  ready_for_approval: { label: 'Ready for approval', variant: 'success' },
  approved: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  resubmit_required: { label: 'Resubmit', variant: 'warning' },
};

type Filter = 'all' | KycStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'docs_submitted', label: 'Docs in' },
  { value: 'video_pending', label: 'Video pending' },
  { value: 'approved', label: 'Verified' },
  { value: 'resubmit_required', label: 'Resubmit' },
  { value: 'rejected', label: 'Rejected' },
];

function DriverCard({ d }: { d: Driver }) {
  const kyc = KYC_BADGE[d.kycStatus] ?? KYC_BADGE.pending;
  const city = d.currentCity?.name ?? d.homeCity?.name;
  const vehicleCount = (d.vehicles ?? []).length;
  return (
    <Card className="gap-2 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <Link to={`/drivers/${d.id}`} className="flex flex-1 items-start gap-3 min-w-0">
          {d.profilePhotoUrl ? (
            <img src={d.profilePhotoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary" aria-hidden>
              {d.fullName ? initials(d.fullName) : '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold">{d.fullName || 'Unnamed driver'}</span>
              <Badge variant={kyc.variant}>{kyc.label}</Badge>
            </div>
            <div className="mt-0.5 text-xs text-secondary">
              {d.ratingCount > 0 ? (
                <>
                  <span className="font-semibold text-amber-600">{formatRating(d.ratingAvg)}</span> · {d.ratingCount} review{d.ratingCount === 1 ? '' : 's'} ·{' '}
                </>
              ) : (
                <>No ratings yet · </>
              )}
              {d.totalTripsCompleted} trip{d.totalTripsCompleted === 1 ? '' : 's'}
              {city ? ` · ${city}` : ''}
            </div>
            <div className="mt-0.5 text-xs text-secondary">
              {d.phone || '—'}
              {d.email ? ` · ${d.email}` : ''}
              {vehicleCount > 0 ? (
                <>
                  {' '}
                  · <Car className="inline size-3" aria-hidden /> {vehicleCount} vehicle{vehicleCount === 1 ? '' : 's'}
                </>
              ) : null}
            </div>
          </div>
        </Link>
        <Link to={`/administration/kyc?driverId=${d.id}`} className="shrink-0 self-center text-xs font-medium text-primary underline">
          KYC →
        </Link>
      </div>
      {d.userId ? (
        <div className="flex justify-end">
          <BugReporterToggle userId={d.userId} initial={d.canReportBugs} />
        </div>
      ) : null}
    </Card>
  );
}

const PAGE_SIZE = 50;

/**
 * `/administration/drivers` — read-only admin driver directory (admin-only). Defaults to "All"
 * (no KYC filter). Loads pages of 50 via `useInfiniteDrivers`; the IntersectionObserver sentinel
 * at the bottom auto-fetches the next page. The header shows the live total from the server.
 */
export function AdminDriversPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = { ...(filter === 'all' ? {} : { kycStatus: filter as KycStatus }), ...(debouncedQ ? { search: debouncedQ } : {}) };
  const driversQuery = useInfiniteDrivers(Object.keys(params).length ? params : undefined, PAGE_SIZE);

  const rows = useMemo(() => (driversQuery.data?.pages.flatMap((p) => p.data) ?? []), [driversQuery.data]);
  const total = driversQuery.data?.pages[0]?.meta.total;
  const filtered = rows;

  // Auto-fetch the next page when the bottom sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !driversQuery.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !driversQuery.isFetchingNextPage) void driversQuery.fetchNextPage();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [driversQuery]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Drivers</h1>
        {typeof total === 'number' ? <span className="text-sm text-secondary">{total.toLocaleString('en-IN')} total</span> : null}
      </div>
      <p className="text-sm text-secondary">
        Read-only directory. Move a driver through verification in the{' '}
        <Link to="/administration/kyc" className="text-primary underline">
          KYC review queue
        </Link>
        .
      </p>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.value ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email" aria-label="Search drivers" />

      {driversQuery.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : driversQuery.isError ? (
        <ErrorState title="Couldn't load drivers" message="Check your connection and try again." onRetry={() => void driversQuery.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users className="size-7" />} title="No drivers" message={q.trim() ? 'No drivers match that search.' : filter === 'all' ? 'No drivers yet.' : 'No drivers with this KYC status.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <DriverCard key={d.id} d={d} />
          ))}
          <div ref={sentinelRef} aria-hidden className="h-1" />
          {driversQuery.isFetchingNextPage ? <LoadingSkeleton rows={2} /> : null}
          {!driversQuery.hasNextPage && rows.length > PAGE_SIZE ? (
            <p className="py-2 text-center text-xs text-secondary">— end of list ({rows.length.toLocaleString('en-IN')} loaded) —</p>
          ) : null}
          {driversQuery.hasNextPage && !driversQuery.isFetchingNextPage ? (
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="outline" onClick={() => void driversQuery.fetchNextPage()}>Load more</Button>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default AdminDriversPage;
