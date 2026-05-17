import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Flag, Clock, Car } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatPickupTime } from '@/lib/utils';
import { FareNumeral } from '@/components/v2/field-companion/FareNumeral';
import { StickyCtaBar } from '@/components/v2/field-companion/StickyCtaBar';
import { useTripDetail } from '@/pages/v2/shared/useTripDetail';

/**
 * v2 Field Companion — trip detail. Vertical timeline, huge numerals,
 * one big bottom CTA.
 */
export function FieldTripDetailPage() {
  const { isLoading, isError, refetch, data: trip } = useTripDetail();

  if (isLoading) {
    return (
      <div className="p-5">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }
  if (isError || !trip) {
    return (
      <div className="p-5">
        <ErrorState message="Couldn't load trip." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-32">
      <header className="flex items-center gap-3 px-5 pt-4">
        <Link to="/v3/trips" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[22px] font-bold">Trip</h1>
      </header>

      <section className="mt-4 rounded-card bg-surface p-5 shadow-card">
        <Timeline
          from={trip.fromCity?.name ?? '—'}
          to={trip.toCity?.name ?? '—'}
          when={formatPickupTime(trip.pickupAt)}
          km={Math.round(trip.expectedDistanceKm)}
        />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 px-5">
        <Tile icon={<Car className="size-5" />} label="Vehicle" value={trip.carTypeLabel ?? '—'} />
        <Tile icon={<Clock className="size-5" />} label="Pickup" value={formatPickupTime(trip.pickupAt)} />
      </section>

      <section className="mt-4 rounded-card bg-surface p-5 text-center shadow-card mx-5">
        <FareNumeral amount={trip.driverPayout} sublabel="your payout" />
      </section>

      <StickyCtaBar>
        <button type="button" className="h-14 w-full rounded-control bg-primary text-[17px] font-semibold text-primary-foreground shadow-fab">
          Apply for this trip
        </button>
      </StickyCtaBar>
    </div>
  );
}

function Timeline({ from, to, when, km }: { from: string; to: string; when: string; km: number }) {
  return (
    <div className="space-y-4">
      <Stop icon={<MapPin className="size-5" />} label="Pickup" place={from} time={when} />
      <div className="ml-[10px] h-8 border-l-2 border-dashed border-muted-foreground/40" />
      <Stop icon={<Flag className="size-5" />} label={`Drop · ${km} km`} place={to} time="ETA on arrival" />
    </div>
  );
}

function Stop({ icon, label, place, time }: { icon: React.ReactNode; label: string; place: string; time: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 text-primary">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-[20px] font-semibold leading-tight">{place}</div>
        <div className="text-[14px] text-muted-foreground">{time}</div>
      </div>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div className="text-primary">{icon}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[16px] font-semibold">{value}</div>
    </div>
  );
}

export default FieldTripDetailPage;
