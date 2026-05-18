import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { useDriverAnalytics } from '@/hooks/useAnalytics';
import { MonthlyEarningsChart } from '@/components/analytics';
import { Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatKm, formatRating } from '@/lib/utils';
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
        icon={<BarChart3 className="size-7" />}
        title="No analytics yet"
        message={a.hasDriverProfile ? "Once an agent picks you for a trip, your trip stats, application history, and monthly trend show up here." : 'Set up your driver profile and start applying — your analytics will show up here.'}
        action={
          <Button asChild variant="full" size="sm">
            <Link to="/app/trips">Browse trips</Link>
          </Button>
        }
      />
    );
  }
  const winRate = a.applicationsTotal > 0 ? Math.round((a.applicationsSelected / a.applicationsTotal) * 100) : 0;
  return (
    <>
      {/* Trip-side stats (the ₹ stats live on /my-earnings — this page is the
          analytics complement: applications, conversion, ratings, monthly trend). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Trips completed" value={a.tripsCompleted} sub={`${a.tripsAssigned} total assigned`} />
        <Stat label="Applications" value={a.applicationsTotal} sub={`${a.applicationsSelected} won · ${a.applicationsPending} pending`} />
        <Stat label="Win rate" value={`${winRate}%`} sub="of applications selected" />
        <Stat label="Distance driven" value={formatKm(a.distanceCompletedKm)} sub="across completed trips" />
        <Stat label="Reviews received" value={a.reviewsReceived} sub={a.reviewsReceived > 0 ? `${formatRating(a.avgReviewScore)} avg` : 'none yet'} />
        <Stat label="Live + ready trips" value={a.tripsByStatus.in_progress ?? 0 + (a.tripsByStatus.accepted ?? 0)} sub="in-progress + accepted" />
      </div>

      <StatusBreakdown byStatus={a.tripsByStatus} />

      <Card className="gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="size-4 text-secondary" aria-hidden /> Earnings & activity — last 6 months
        </div>
        <MonthlyEarningsChart data={a.monthly} />
      </Card>

      <Card className="gap-1">
        <Link to="/app/my-earnings" className="text-sm font-medium text-primary underline">
          See your ₹ earnings + payout history →
        </Link>
      </Card>

      <p className="text-xs text-secondary">Generated {genAt(a.generatedAt)} · refreshes every minute.</p>
    </>
  );
}

/**
 * `/app/driver-analytics` — the signed-in driver's trip-side analytics (the `/app/analytics/driver`
 * blob, framed for trip stats rather than ₹). Complements `/app/my-earnings` which is the
 * ₹-focused view. Linked from the Driver Home Analytics tile.
 */
export function DriverAnalyticsPage() {
  const q = useDriverAnalytics();
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/app" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Your analytics</h1>

      {q.isPending ? (
        <LoadingSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your analytics" message="Check your connection and try again." onRetry={() => void q.refetch()} />
      ) : (
        <Body a={q.data} />
      )}
    </main>
  );
}

export default DriverAnalyticsPage;
