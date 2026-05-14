import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Snowflake, Sparkles } from 'lucide-react';
import { useTrips } from '@/hooks/useTrips';
import { carTypeHooks, cityHooks } from '@/hooks/useAdminConfig';
import { NearMeFilter } from '@/components/location/NearMeFilter';
import { routeChainText, TripTypeBadge } from '@/components/trip/RouteChain';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import type { NearRadius, Trip, TripStatus } from '@/types';

/** Trips a driver can still apply to. */
const FEED_STATUSES: TripStatus[] = ['open', 'has_applicants'];

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link to={`/trips/${trip.id}`} className="block">
      <Card className="gap-2 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-bold">{routeChainText(trip)}</div>
            <div className="text-xs text-secondary">
              {Math.round(trip.expectedDistanceKm)} km · {formatPickupTime(trip.pickupAt)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-bold">{formatINR(trip.driverPayout)}</div>
            <div className="text-[10px] text-secondary">payout · {formatINR(trip.driverBata)} bata incl.</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <TripTypeBadge trip={trip} />
          {trip.distanceKm != null ? (
            <Badge variant="muted">
              <MapPin className="size-3" aria-hidden /> {trip.distanceKm} km away
            </Badge>
          ) : null}
          {trip.carTypeLabel ? <Badge variant="outline">{trip.carTypeLabel}</Badge> : null}
          {trip.acRequired ? <Badge variant="outline">AC</Badge> : null}
          <Badge variant="muted">{formatINR(trip.ratePerKm)}/km</Badge>
          <Badge variant={trip.postedByRole === 'driver' ? 'muted' : 'info'}>{trip.postedByRole === 'driver' ? 'Posted by a driver' : 'Posted by an agent'}</Badge>
          {trip.applicantCount > 0 ? (
            <Badge variant="warning">
              <Sparkles className="size-3" aria-hidden /> {trip.applicantCount} applied
            </Badge>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

const chipClass = 'h-8 rounded-full border border-input bg-white px-3 text-xs';

/**
 * `/trips` — the open-trip feed. Drivers browse trips that are still `open` or
 * `has_applicants`, filtered by pickup city / car type / AC; each card links to
 * the trip detail. Data from `useTrips`; filter options from `useAdminConfig`.
 * Prototype layout: a white header strip, a white filter strip, then the cards
 * on the page background.
 */
export function TripFeedPage() {
  const [fromCityId, setFromCityId] = useState('');
  const [carTypeId, setCarTypeId] = useState('');
  const [acOnly, setAcOnly] = useState(false);
  const [near, setNear] = useState<NearRadius | null>(null);

  const tripsQuery = useTrips({ status: FEED_STATUSES, fromCityId: fromCityId || undefined, ...(near ? { near } : {}) });
  const citiesQuery = cityHooks.useList();
  const carTypesQuery = carTypeHooks.useList();

  const trips = tripsQuery.data ?? [];
  const filtered = trips.filter((t) => (carTypeId === '' || t.carTypeId === carTypeId) && (!acOnly || t.acRequired));
  const anyFilter = carTypeId !== '' || acOnly || fromCityId !== '' || near != null;

  function clearFilters() {
    setCarTypeId('');
    setAcOnly(false);
    setFromCityId('');
    setNear(null);
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="border-b bg-white px-4 py-3">
        <h1 className="text-base font-semibold">Open trips</h1>
        <p className="text-xs text-secondary">
          {tripsQuery.isSuccess ? `${filtered.length} trip${filtered.length === 1 ? '' : 's'}${near ? ` within ${near.radiusKm} km` : ''} you can apply to` : 'Trips that still need a driver'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5">
        <label className="sr-only" htmlFor="feed-city">
          Filter by pickup city
        </label>
        <select id="feed-city" value={fromCityId} onChange={(e) => setFromCityId(e.target.value)} className={chipClass}>
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
        <select id="feed-cartype" value={carTypeId} onChange={(e) => setCarTypeId(e.target.value)} className={chipClass}>
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
          className={`flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium ${acOnly ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-input bg-white'}`}
        >
          <Snowflake className="size-3.5" aria-hidden /> AC only
        </button>
        <NearMeFilter value={near} onChange={setNear} />
      </div>

      <div className="space-y-3 p-4">
        {tripsQuery.isPending ? (
          <LoadingSkeleton rows={5} />
        ) : tripsQuery.isError ? (
          <ErrorState title="Couldn't load trips" message="Check your connection and try again." onRetry={() => void tripsQuery.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MapPin className="size-7" />}
            title={anyFilter ? 'No trips match your filters' : 'No open trips right now'}
            message={
              anyFilter
                ? near
                  ? 'Try a bigger radius, or clear the location filter.'
                  : 'Try clearing the car-type / AC filter or picking a different pickup city.'
                : 'New trips from your area will show up here.'
            }
            action={
              anyFilter ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          filtered.map((t) => <TripCard key={t.id} trip={t} />)
        )}
      </div>
    </div>
  );
}

export default TripFeedPage;
