import { useState } from 'react';
import { MapPin, Snowflake, Sparkles } from 'lucide-react';
import { useTrips } from '@/hooks/useTrips';
import { carTypeHooks, cityHooks } from '@/hooks/useAdminConfig';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { Trip, TripStatus } from '@/types';

/** Trips a driver can still apply to. */
const FEED_STATUSES: TripStatus[] = ['open', 'has_applicants'];

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function pickupLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Card className="gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">
            {trip.fromCity.name} → {trip.toCity.name}
          </div>
          <div className="text-xs text-secondary">
            {Math.round(trip.expectedDistanceKm)} km · {pickupLabel(trip.pickupAt)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold">{inr(trip.driverPayout)}</div>
          <div className="text-[10px] text-secondary">payout · {inr(trip.driverBata)} bata incl.</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {trip.carTypeLabel ? <Badge variant="outline">{trip.carTypeLabel}</Badge> : null}
        {trip.acRequired ? <Badge variant="outline">AC</Badge> : null}
        <Badge variant="muted">{inr(trip.ratePerKm)}/km</Badge>
        <Badge variant={trip.postedByRole === 'driver' ? 'muted' : 'info'}>{trip.postedByRole === 'driver' ? 'Posted by a driver' : 'Posted by an agent'}</Badge>
        {trip.applicantCount > 0 ? (
          <Badge variant="warning">
            <Sparkles className="size-3" aria-hidden /> {trip.applicantCount} applied
          </Badge>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * `/trips` — the open-trip feed. Drivers browse trips that are still `open` or
 * `has_applicants` (filter by pickup city / car type / AC). The trip-detail +
 * apply flow lands as a follow-up screen. Data comes from `useTrips`; city /
 * car-type filter options from `useAdminConfig`.
 */
export function TripFeedPage() {
  const [fromCityId, setFromCityId] = useState('');
  const [carTypeId, setCarTypeId] = useState('');
  const [acOnly, setAcOnly] = useState(false);

  const tripsQuery = useTrips({ status: FEED_STATUSES, fromCityId: fromCityId || undefined });
  const citiesQuery = cityHooks.useList();
  const carTypesQuery = carTypeHooks.useList();

  const trips = tripsQuery.data ?? [];
  const filtered = trips.filter((t) => (carTypeId === '' || t.carTypeId === carTypeId) && (!acOnly || t.acRequired));

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header>
        <h1 className="text-xl font-bold">Open trips</h1>
        <p className="text-sm text-secondary">{tripsQuery.isSuccess ? `${filtered.length} trip${filtered.length === 1 ? '' : 's'} you can apply to` : 'Trips that still need a driver'}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="feed-city">
          Filter by pickup city
        </label>
        <select id="feed-city" value={fromCityId} onChange={(e) => setFromCityId(e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">All pickup cities</option>
          {(citiesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="feed-cartype">
          Filter by car type
        </label>
        <select id="feed-cartype" value={carTypeId} onChange={(e) => setCarTypeId(e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">All car types</option>
          {(carTypesQuery.data ?? []).map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAcOnly((v) => !v)}
          aria-pressed={acOnly}
          className={`flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-medium ${acOnly ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-input bg-background'}`}
        >
          <Snowflake className="size-3.5" aria-hidden /> AC only
        </button>
      </div>

      {tripsQuery.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : tripsQuery.isError ? (
        <ErrorState title="Couldn't load trips" message="Check your connection and try again." onRetry={() => void tripsQuery.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-7" />}
          title={trips.length === 0 ? 'No open trips right now' : 'No trips match your filters'}
          message={trips.length === 0 ? 'New trips from your area will show up here.' : 'Try clearing the car-type / AC filter or picking a different pickup city.'}
          action={
            trips.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCarTypeId('');
                  setAcOnly(false);
                  setFromCityId('');
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </main>
  );
}

export default TripFeedPage;
