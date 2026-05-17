import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { routeChainText } from '@/components/trip/RouteChain';
import { StatusDot } from '@/components/v2/operator-console/StatusDot';
import type { TripStatus } from '@/types';

const STATUSES: TripStatus[] = ['open', 'has_applicants', 'accepted', 'in_progress'];

/**
 * v2 Operator Console — home. A control-tower dashboard: dense stat
 * tiles + a "live feed" of the most recent trips. No greeting hero.
 */
export function OperatorHomePage() {
  const { user } = useAuth();
  const query = useTrips({ status: STATUSES });
  const trips = query.data ?? [];

  const counts = {
    needAction: trips.filter((t) => t.status === 'has_applicants').length,
    active: trips.filter((t) => t.status === 'in_progress' || t.status === 'accepted').length,
    payoutToday: trips
      .filter((t) => t.status === 'accepted' || t.status === 'in_progress')
      .reduce((sum, t) => sum + t.driverPayout, 0),
  };

  return (
    <div className="mx-auto max-w-md">
      <header className="border-b border-border bg-surface px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dashboard</div>
        <div className="text-[15px] font-semibold">{user?.displayName ?? user?.phone ?? 'Operator'}</div>
      </header>

      <div className="grid grid-cols-3 border-b border-border">
        <Stat label="Active" value={String(counts.active)} />
        <Stat label="Need action" value={String(counts.needAction)} amber={counts.needAction > 0} />
        <Stat label="Payout" value={formatINR(counts.payoutToday)} />
      </div>

      <section>
        <SectionLabel>Live feed</SectionLabel>
        {query.isLoading ? (
          <div className="p-3"><LoadingSkeleton rows={4} /></div>
        ) : trips.length === 0 ? (
          <div className="p-3 text-[12px] text-muted-foreground">No active trips.</div>
        ) : (
          trips.slice(0, 6).map((t) => (
            <Link
              key={t.id}
              to={`/v2/trips/${t.id}`}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2 text-[13px] hover:bg-surface-muted"
            >
              <StatusDot status={t.status} />
              <div className="min-w-0">
                <div className="truncate">{routeChainText(t)}</div>
                <div className="text-[11px] text-muted-foreground">{formatPickupTime(t.pickupAt)}</div>
              </div>
              <div className="font-medium">{formatINR(t.driverPayout)}</div>
            </Link>
          ))
        )}
        <Link
          to="/v2/trips"
          className="flex items-center justify-between border-b border-border px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <span>Browse all trips</span>
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </section>
    </div>
  );
}

function Stat({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <div className="border-r border-border p-3 last:border-r-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-[18px] font-semibold ${amber ? 'text-amber-600' : ''}`}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">{children}</div>;
}

export default OperatorHomePage;
