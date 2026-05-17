import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { routeChainText } from '@/components/trip/RouteChain';
import { StatusDot } from '@/components/v2/operator-console/StatusDot';
import { useTripDetail } from '@/pages/v2/shared/useTripDetail';

/**
 * v2 Operator Console — trip detail. Dense info-grid, hairline rules,
 * monospace ID, tabular numbers. No decorative space.
 */
export function OperatorTripDetailPage() {
  const { isLoading, isError, refetch, data: trip } = useTripDetail();

  if (isLoading) {
    return (
      <div className="p-3">
        <LoadingSkeleton rows={6} />
      </div>
    );
  }
  if (isError || !trip) {
    return (
      <div className="p-3">
        <ErrorState message="Couldn't load trip." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2/trips" className="rounded-control p-1 text-muted-foreground hover:bg-surface-muted" aria-label="Back to trips">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-mono text-[12px] text-muted-foreground">TRP-{trip.id.slice(0, 7).toUpperCase()}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <StatusDot status={trip.status} /> {trip.status.replace('_', ' ')}
        </span>
      </header>

      <section className="border-b border-border px-3 py-3">
        <h1 className="text-[16px] font-semibold tracking-tight">{routeChainText(trip)}</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{formatPickupTime(trip.pickupAt)} · {Math.round(trip.expectedDistanceKm)} km</p>
      </section>

      <Row label="Vehicle" value={`${trip.carTypeLabel ?? '—'} · ${trip.seatsRequired} seats${trip.acRequired ? ' · AC' : ''}`} />
      <Row label="Rate" value={`${formatINR(trip.ratePerKm)}/km`} />
      <Row label="Total fare" value={formatINR(trip.totalFare)} />
      <Row label="GST" value={formatINR(trip.gstAmount)} />
      <Row label="Commission" value={`${trip.commissionPct}%`} />
      <Row label="Driver bata" value={formatINR(trip.driverBata)} />
      <Row label="Driver payout" value={formatINR(trip.driverPayout)} bold />
      <Row label="Applicants" value={String(trip.applicantCount)} />
      <Row label="Pending invites" value={String(trip.pendingInvitationCount)} />
      <Row label="Posted by" value={trip.postedByName ?? trip.postedByHandle} />

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-2">
        <button type="button" className="flex-1 rounded-control border border-border px-3 py-2 text-[13px]">Decline all</button>
        <button type="button" className="flex-1 rounded-control bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground">Select driver</button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="grid grid-cols-[40%_60%] items-center gap-3 border-b border-border px-3 py-2 text-[13px]">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-right ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

export default OperatorTripDetailPage;
