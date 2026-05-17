import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { useTripDetail } from '@/pages/v2/shared/useTripDetail';

/**
 * v2 Editorial — trip detail. Full-bleed stylised route map "hero",
 * then a serif italic headline, then a "letterpress" two-column
 * stats grid. Designed to feel like opening a travel feature.
 */
export function EditorialTripDetailPage() {
  const { isLoading, isError, refetch, data: trip } = useTripDetail();

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }
  if (isError || !trip) {
    return (
      <div className="p-6">
        <ErrorState message="Couldn't load this feature." onRetry={() => refetch()} />
      </div>
    );
  }

  const from = trip.fromCity?.name ?? '—';
  const to = trip.toCity?.name ?? '—';

  return (
    <div className="mx-auto max-w-md pb-16">
      <Link
        to="/v5"
        aria-label="Back"
        className="m-3 inline-flex items-center gap-1 rounded-pill bg-surface px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground shadow-card"
      >
        <ArrowLeft className="size-3" /> the journal
      </Link>

      <RouteHero from={from} to={to} />

      <article className="px-6 pt-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Feature trip · {formatPickupTime(trip.pickupAt)}
        </div>
        <h1 className="editorial-headline mt-2 text-[34px] leading-[0.95]">
          {from} <span className="text-muted-foreground italic">to</span> {to}
        </h1>
        <p className="mt-4 text-[15px] italic leading-relaxed text-muted-foreground">
          A {Math.round(trip.expectedDistanceKm)}-kilometre passage by{' '}
          {trip.carTypeLabel?.toLowerCase() ?? 'road'}, scheduled to push off in the
          late afternoon. The journal's editors recommend a window seat.
        </p>

        <hr className="my-6 border-foreground/30" />

        <dl className="grid grid-cols-2 gap-y-4 text-[13px]">
          <Field label="The vessel" value={`${trip.carTypeLabel ?? 'TBD'} · ${trip.seatsRequired} seats`} />
          <Field label="Distance" value={`${Math.round(trip.expectedDistanceKm)} km`} />
          <Field label="Tariff" value={formatINR(trip.totalFare)} />
          <Field label="Driver's share" value={formatINR(trip.driverPayout)} />
          <Field label="Posted by" value={trip.postedByName ?? trip.postedByHandle} />
          <Field label="Interested" value={`${trip.applicantCount} drivers`} />
        </dl>

        <button
          type="button"
          className="mt-8 inline-flex items-center gap-2 border-b border-foreground pb-1 text-[14px] tracking-wide hover:text-primary"
        >
          Express interest →
        </button>
      </article>
    </div>
  );
}

function RouteHero({ from, to }: { from: string; to: string }) {
  return (
    <div
      className="relative mx-3 h-44 overflow-hidden rounded-card border border-border"
      style={{ background: 'var(--skin-editorial-terracotta-bg)' }}
    >
      <svg viewBox="0 0 320 176" className="h-full w-full text-foreground/70" aria-hidden>
        <circle cx="40" cy="140" r="6" fill="currentColor" />
        <circle cx="280" cy="32" r="6" fill="currentColor" />
        <path d="M 40 140 Q 110 150 160 90 T 280 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" />
        {/* a couple of "landmarks" */}
        <text x="50" y="158" className="fill-current text-[10px] italic">{from}</text>
        <text x="232" y="22" className="fill-current text-[10px] italic">{to}</text>
      </svg>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="editorial-headline mt-0.5 text-[18px] leading-tight">{value}</dd>
    </div>
  );
}

export default EditorialTripDetailPage;
