import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, IndianRupee } from 'lucide-react';
import { useDriverAnalytics } from '@/hooks/useAnalytics';
import { MonthlyEarningsChart } from '@/components/analytics';
import { Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatKm, formatRating } from '@/lib/utils';
import type { DriverAnalytics } from '@/types';

function genAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card className="gap-0.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-secondary">{sub}</div> : null}
    </Card>
  );
}

function StatusBreakdown({ byStatus }: { byStatus: Record<string, number> }) {
  const rows = Object.entries(byStatus).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  return (
    <Card className="gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Your assigned trips by status</div>
      <ul className="space-y-0.5 text-sm">
        {rows.map(([k, n]) => (
          <li key={k} className="flex justify-between gap-2">
            <span className="capitalize">{k.replace(/_/g, ' ')}</span>
            <span className="tabular-nums font-medium">{n}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Body({ a }: { a: DriverAnalytics }) {
  if (!a.hasDriverProfile || a.tripsAssigned === 0) {
    return (
      <EmptyState
        icon={<IndianRupee className="size-7" />}
        title="No earnings yet"
        message={a.hasDriverProfile ? "Once a trip manager picks you for a trip, your earnings and history show up here." : 'Set up your driver profile and start applying — your earnings and history will show up here.'}
        action={
          <Button asChild variant="full" size="sm">
            <Link to="/trips">Browse trips</Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Earned" value={formatINR(a.earningsTotal)} sub={`across ${a.tripsCompleted} completed trip${a.tripsCompleted === 1 ? '' : 's'}`} />
        <Stat label="Pending" value={formatINR(a.earningsPending)} sub="assigned / in-progress trips" />
        <Stat label="Distance driven" value={formatKm(a.distanceCompletedKm)} sub="across completed trips" />
        <Stat label="Trips assigned" value={a.tripsAssigned} />
        <Stat label="Applications" value={a.applicationsTotal} sub={`${a.applicationsSelected} won · ${a.applicationsPending} pending`} />
        <Stat label="Reviews received" value={a.reviewsReceived} sub={a.reviewsReceived > 0 ? `${formatRating(a.avgReviewScore)} avg` : 'none yet'} />
      </div>

      <StatusBreakdown byStatus={a.tripsByStatus} />

      <Card className="gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="size-4 text-secondary" aria-hidden /> Earnings — last 6 months
        </div>
        <MonthlyEarningsChart data={a.monthly} />
      </Card>

      <Card className="gap-1">
        <Link to="/my-trips" className="text-sm font-medium text-primary underline">
          See all your trips →
        </Link>
      </Card>

      <p className="text-xs text-secondary">Generated {genAt(a.generatedAt)} · refreshes every minute.</p>
    </>
  );
}

/**
 * `/my-earnings` — the signed-in driver's earnings & history (the `/analytics/driver` blob for the
 * caller): ₹ earned / pending, trips completed + by-status, distance driven, applications won/pending,
 * reviews received, and a 6-month earnings chart. Linked from the driver profile and home.
 */
export function DriverEarningsPage() {
  const q = useDriverAnalytics();
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Your earnings</h1>

      {q.isPending ? (
        <LoadingSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your earnings" message="Check your connection and try again." onRetry={() => void q.refetch()} />
      ) : (
        <Body a={q.data} />
      )}
    </main>
  );
}

export default DriverEarningsPage;
