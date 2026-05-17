import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';

const CITY_TAMIL: Record<string, string> = {
  Vellore: 'வேலூர்',
  Chennai: 'சென்னை',
  Bangalore: 'பெங்களூரு',
  Tirupati: 'திருப்பதி',
  Salem: 'சேலம்',
  Coimbatore: 'கோயம்புத்தூர்',
  Pondicherry: 'புதுச்சேரி',
};
const ta = (n?: string) => (n ? (CITY_TAMIL[n] ?? n) : '—');

export function BharatMyTripsPage() {
  const query = useMyApplications();
  const apps = query.data ?? [];

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="bg-primary px-4 pb-5 pt-4 text-primary-foreground">
        <Link to="/v6" aria-label="Back" className="mb-3 inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <BilingualText as="h1" ta="என்னுடைய டிரிப்கள்" en="My trips" size="lg" />
      </header>
      <div className="space-y-3 p-4">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="ஏற்ற முடியவில்லை · Couldn't load." onRetry={() => query.refetch()} />
        ) : apps.length === 0 ? (
          <EmptyState title="டிரிப்கள் இல்லை · No trips" message="Apply for a trip from the home screen." />
        ) : (
          apps.map((a) => (
            <Link
              key={a.acceptanceId}
              to={`/v6/trips/${a.trip.id}`}
              className="flex items-center justify-between rounded-card bg-surface p-4 shadow-card"
            >
              <div className="min-w-0">
                <div className="text-[18px] font-semibold leading-tight">
                  {ta(a.trip.fromCity?.name)} → {ta(a.trip.toCity?.name)}
                </div>
                <div className="text-[11px] text-muted-foreground">{a.trip.fromCity?.name} → {a.trip.toCity?.name}</div>
                <div className="mt-1 text-[12px] uppercase tracking-wide text-primary">{a.status}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[18px] font-bold" style={{ color: 'var(--skin-bharat-vermilion)' }}>
                  {formatINR(a.trip.driverPayout)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{formatPickupTime(a.trip.pickupAt)}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default BharatMyTripsPage;
