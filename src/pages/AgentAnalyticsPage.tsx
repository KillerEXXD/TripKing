import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { useAgentAnalytics } from '@/hooks/useAnalytics';
import { TripsMonthlyChart } from '@/components/analytics';
import { Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatRating } from '@/lib/utils';
import type { AgentAnalytics } from '@/types';

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
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Your trips by status</div>
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

function Body({ a }: { a: AgentAnalytics }) {
  if (a.tripsPosted === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-7" />}
        title="No trips yet"
        message="Once you post (and run) trips, your analytics — fare totals, applicants, the monthly trend — show up here."
        action={
          <Button asChild variant="full" size="sm">
            <Link to="/app/trips/new">Post a trip</Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Trips posted" value={a.tripsPosted} />
        <Stat label="Applicants received" value={a.applicantsReceivedTotal} />
        <Stat label="Drivers used" value={a.uniqueDriversAssigned} sub="distinct assigned drivers" />
        <Stat label="Fare posted" value={formatINR(a.farePostedTotal)} sub="total across all your trips" />
        <Stat label="Fare (completed)" value={formatINR(a.fareCompletedTotal)} />
        <Stat label="Driver payout (completed)" value={formatINR(a.driverPayoutCompletedTotal)} />
        <Stat label="Avg rate / km" value={`₹${a.avgRatePerKm}`} />
        <Stat label="Reviews received" value={a.reviewsReceived} sub={a.reviewsReceived > 0 ? `${formatRating(a.avgReviewScore)} avg` : 'none yet'} />
      </div>

      <StatusBreakdown byStatus={a.tripsByStatus} />

      <Card className="gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="size-4 text-secondary" aria-hidden /> Your trips — last 6 months
        </div>
        <TripsMonthlyChart data={a.monthly} />
      </Card>

      <p className="text-xs text-secondary">Generated {genAt(a.generatedAt)} · refreshes every minute.</p>
    </>
  );
}

/**
 * `/app/analytics` — the signed-in user's trip-posting analytics (the `/app/analytics/agent` blob for the
 * caller). Primarily for trip managers; a driver who's posted trips sees the same. Linked from the
 * agent home and the agent profile.
 */
export function AgentAnalyticsPage() {
  const q = useAgentAnalytics();
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

export default AgentAnalyticsPage;
