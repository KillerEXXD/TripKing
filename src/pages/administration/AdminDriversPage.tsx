import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Car, Users } from 'lucide-react';
import { useDrivers } from '@/hooks/useDrivers';
import { Badge, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatRating, initials } from '@/lib/utils';
import type { Driver, KycStatus } from '@/types';

const KYC_BADGE: Record<KycStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  pending: { label: 'Pending', variant: 'muted' },
  docs_submitted: { label: 'Docs in', variant: 'info' },
  video_pending: { label: 'Video pending', variant: 'info' },
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
    </Card>
  );
}

/**
 * `/administration/drivers` — a read-only admin driver directory (admin-only). Filter chips drive
 * `useDrivers({ kycStatus })` server-side (the KYC review queue uses the same filter); the search
 * box narrows the loaded list by name/phone client-side. Each row links to the public profile.
 * (Moving a driver through KYC is the KYC review queue; deactivating one isn't exposed yet.)
 */
export function AdminDriversPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const driversQuery = useDrivers({ ...(filter === 'all' ? {} : { kycStatus: filter }), limit: 200 });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = driversQuery.data ?? [];
    if (!term) return list;
    return list.filter((d) => d.fullName.toLowerCase().includes(term) || (d.phone ?? '').toLowerCase().includes(term) || (d.email ?? '').toLowerCase().includes(term));
  }, [driversQuery.data, q]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Drivers</h1>
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
        </div>
      )}
    </main>
  );
}

export default AdminDriversPage;
