import { Link } from 'react-router-dom';
import { ChevronLeft, Car, Clock, MapPin, IndianRupee, Users } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';
import { useTripDetail } from '@/pages/v2/shared/useTripDetail';

const CITY_TAMIL: Record<string, string> = {
  Vellore: 'வேலூர்',
  Chennai: 'சென்னை',
  Bangalore: 'பெங்களூரு',
  Tirupati: 'திருப்பதி',
  Salem: 'சேலம்',
  Coimbatore: 'கோயம்புத்தூர்',
  Pondicherry: 'புதுச்சேரி',
};

const ta = (name?: string) => (name ? (CITY_TAMIL[name] ?? name) : '—');

/**
 * v2 Bharat-Native — trip detail. Bilingual headline (Tamil large +
 * English subtitle), 4 icon-tile attribute grid, traffic-light status,
 * big vermilion CTA.
 */
export function BharatTripDetailPage() {
  const { isLoading, isError, refetch, data: trip } = useTripDetail();

  if (isLoading) {
    return (
      <div className="p-4">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }
  if (isError || !trip) {
    return (
      <div className="p-4">
        <ErrorState message="டிரிப்பை ஏற்ற முடியவில்லை · Couldn't load trip." onRetry={() => refetch()} />
      </div>
    );
  }

  const from = trip.fromCity?.name ?? '—';
  const to = trip.toCity?.name ?? '—';

  return (
    <div className="mx-auto max-w-md pb-12">
      <header className="bg-primary px-4 pb-5 pt-4 text-primary-foreground">
        <Link to="/v6/trips" aria-label="Back" className="mb-3 inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-[22px] font-semibold leading-tight">
          {ta(from)} <span className="opacity-80">→</span> {ta(to)}
        </div>
        <div className="mt-1 text-[14px] opacity-80">{from} → {to}</div>
      </header>

      <section aria-label="Trip attributes" className="grid grid-cols-2 gap-3 p-4">
        <Tile icon={<Car className="size-5" />} ta="வாகனம்" en="Vehicle" value={trip.carTypeLabel ?? '—'} />
        <Tile icon={<Clock className="size-5" />} ta="நேரம்" en="Time" value={formatPickupTime(trip.pickupAt)} />
        <Tile icon={<MapPin className="size-5" />} ta="தூரம்" en="Distance" value={`${Math.round(trip.expectedDistanceKm)} km`} />
        <Tile icon={<IndianRupee className="size-5" />} ta="கட்டணம்" en="Payout" value={formatINR(trip.driverPayout)} accent />
      </section>

      <section className="mx-4 mb-6 rounded-card bg-surface p-4 shadow-card">
        <BilingualText ta="விண்ணப்பதாரர்கள்" en="Applicants" size="md" />
        <div className="mt-2 inline-flex items-center gap-2 text-[15px]">
          <Users className="size-4" /> {trip.applicantCount} drivers
        </div>
      </section>

      <div className="px-4">
        <button
          type="button"
          className="h-14 w-full rounded-control text-[16px] font-semibold text-primary-foreground"
          style={{ background: 'var(--skin-bharat-vermilion)' }}
        >
          ஏற்றுக்கொள் · Accept trip
        </button>
      </div>
    </div>
  );
}

function Tile({ icon, ta: tamil, en, value, accent }: { icon: React.ReactNode; ta: string; en: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div style={{ color: accent ? 'var(--skin-bharat-vermilion)' : 'var(--color-primary)' }}>{icon}</div>
      <BilingualText ta={tamil} en={en} size="sm" className="mt-1" />
      <div
        className={`mt-1.5 text-[18px] font-semibold leading-tight`}
        style={{ color: accent ? 'var(--skin-bharat-vermilion)' : 'inherit' }}
      >
        {value}
      </div>
    </div>
  );
}

export default BharatTripDetailPage;
