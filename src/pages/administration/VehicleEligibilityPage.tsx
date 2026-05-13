import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Car } from 'lucide-react';
import { useInfiniteAdminVehicles } from '@/hooks/useVehicles';
import { type AdminVehiclesQueryParams } from '@/lib/api/services/vehicles';
import { Badge, Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { EligibilityStatus, Vehicle } from '@/types';

const ELIG_LABEL: Record<EligibilityStatus, string> = { eligible: 'Eligible', expiring_soon: 'Expiring soon', expired: 'Expired' };
const ELIG_VARIANT: Record<EligibilityStatus, 'success' | 'warning' | 'destructive'> = { eligible: 'success', expiring_soon: 'warning', expired: 'destructive' };

type Filter = 'all' | 'needs_attention' | 'expiring_soon' | 'expired' | 'eligible';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'eligible', label: 'Eligible' },
];
function paramsFor(f: Filter): AdminVehiclesQueryParams {
  if (f === 'all') return { includeInactive: true };
  if (f === 'needs_attention') return { needsAttention: true, includeInactive: true };
  return { eligibility: [f], includeInactive: true };
}

function expDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function VehicleCard({ v }: { v: Vehicle }) {
  const name = [v.makeLabel, v.modelName].filter(Boolean).join(' ') || 'Vehicle';
  const ins = expDate(v.insuranceExpiry);
  const permit = expDate(v.permitExpiry);
  return (
    <Card className="gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-bold">
            <Car className="size-4 text-secondary" aria-hidden />
            {name}
            {v.year ? ` ${v.year}` : ''}
          </div>
          <div className="text-xs text-secondary">
            {v.registrationNumber ? <span className="font-mono">{v.registrationNumber}</span> : null}
            {v.registrationNumber ? ' · ' : ''}
            {v.carTypeLabel ?? 'Car'} · {v.seats} seats · {v.ac ? 'AC' : 'Non-AC'}
            {v.isActive ? '' : ' · inactive'}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {v.eligibilityStatus ? <Badge variant={ELIG_VARIANT[v.eligibilityStatus]}>{ELIG_LABEL[v.eligibilityStatus]}</Badge> : <Badge variant="muted">Unknown year</Badge>}
        </div>
      </div>
      {ins || permit ? (
        <div className="text-xs text-secondary">
          {ins ? <>Insurance: {ins}</> : null}
          {ins && permit ? ' · ' : null}
          {permit ? <>Permit: {permit}</> : null}
        </div>
      ) : null}
      <Link to={`/drivers/${v.driverId}`} className="text-xs font-medium text-primary underline">
        View driver profile →
      </Link>
    </Card>
  );
}

const PAGE_SIZE = 50;

/**
 * `/administration/vehicles` — vehicle-eligibility dashboard (admin-only).
 * Defaults to "All". Server-paginated via `useInfiniteAdminVehicles` (50/page);
 * the eligibility filter is server-derived. Header shows the server total.
 */
export function VehicleEligibilityPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const vehiclesQuery = useInfiniteAdminVehicles(paramsFor(filter), PAGE_SIZE);

  const rows = useMemo(() => (vehiclesQuery.data?.pages.flatMap((p) => p.data) ?? []), [vehiclesQuery.data]);
  const total = vehiclesQuery.data?.pages[0]?.meta.total;

  const vehicles = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (v) =>
        (v.registrationNumber ?? '').toLowerCase().includes(term) ||
        [v.makeLabel, v.modelName].filter(Boolean).join(' ').toLowerCase().includes(term),
    );
  }, [rows, q]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !vehiclesQuery.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !vehiclesQuery.isFetchingNextPage) void vehiclesQuery.fetchNextPage();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [vehiclesQuery]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Vehicle eligibility</h1>
        {typeof total === 'number' ? <span className="text-sm text-secondary">{total.toLocaleString('en-IN')} total</span> : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.value ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by registration number or make / model" aria-label="Search vehicles" />

      {vehiclesQuery.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : vehiclesQuery.isError ? (
        <ErrorState title="Couldn't load vehicles" message="Check your connection and try again." onRetry={() => void vehiclesQuery.refetch()} />
      ) : vehicles.length === 0 ? (
        <EmptyState icon={<Car className="size-7" />} title="Nothing to show" message={q.trim() ? 'No vehicles match that search.' : filter === 'needs_attention' ? 'No vehicles need attention right now.' : 'No vehicles match this filter.'} />
      ) : (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} v={v} />
          ))}
          <div ref={sentinelRef} aria-hidden className="h-1" />
          {vehiclesQuery.isFetchingNextPage ? <LoadingSkeleton rows={2} /> : null}
          {!vehiclesQuery.hasNextPage && rows.length > PAGE_SIZE ? (
            <p className="py-2 text-center text-xs text-secondary">— end of list ({rows.length.toLocaleString('en-IN')} loaded) —</p>
          ) : null}
          {vehiclesQuery.hasNextPage && !vehiclesQuery.isFetchingNextPage ? (
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="outline" onClick={() => void vehiclesQuery.fetchNextPage()}>Load more</Button>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default VehicleEligibilityPage;
