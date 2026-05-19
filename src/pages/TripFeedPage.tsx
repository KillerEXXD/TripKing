import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Sparkles } from 'lucide-react';
import { useInfiniteTrips } from '@/hooks/useTrips';
import { useMyDriver } from '@/hooks/useDrivers';
import { carTypeHooks, cityHooks } from '@/hooks/useAdminConfig';
import { NearMeFilter } from '@/components/location/NearMeFilter';
import { routeChainText, TripTypeBadge } from '@/components/trip/RouteChain';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, InfiniteScrollSentinel, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupDateTime } from '@/lib/utils';
import type { NearRadius, Trip, TripStatus } from '@/types';

/** Trips a driver can still apply to. */
const FEED_STATUSES: TripStatus[] = ['open', 'has_applicants'];

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link to={`/app/trips/${trip.id}?from=/app/trips`} className="block">
      <Card className="gap-2 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-bold">{routeChainText(trip)}</div>
            <div className="text-xs text-secondary">
              {Math.round(trip.expectedDistanceKm)} km · {formatPickupDateTime(trip.pickupAt)}
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

const chipClass = 'h-8 shrink-0 rounded-pill border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-muted';

/**
 * `/app/trips` — the open-trip feed. Drivers browse trips that are still `open` or
 * `has_applicants`, filtered by pickup city / car type / AC; each card links to
 * the trip detail. Data from `useTrips`; filter options from `useAdminConfig`.
 * Prototype layout: a white header strip, a white filter strip, then the cards
 * on the page background.
 */
const DEFAULT_RADIUS_KM = 25;

export function TripFeedPage() {
  const navigate = useNavigate();
  const [fromCityId, setFromCityId] = useState('');
  const [carTypeId, setCarTypeId] = useState('');
  const [near, setNear] = useState<NearRadius | null>(null);

  // Seed filters from the driver's profile on first load — default the pickup city to
  // their `currentCity` and turn Near-me on around their stored coords. Driver can change
  // both. We only seed once per mount; later edits are user-driven.
  const myDriverQuery = useMyDriver();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !myDriverQuery.data) return;
    const d = myDriverQuery.data;
    if (d.currentCity?.id) setFromCityId(d.currentCity.id);
    if (typeof d.currentLat === 'number' && typeof d.currentLng === 'number') {
      setNear({ lat: d.currentLat, lng: d.currentLng, radiusKm: DEFAULT_RADIUS_KM });
    }
    seeded.current = true;
  }, [myDriverQuery.data]);

  const tripsQuery = useInfiniteTrips({ status: FEED_STATUSES, fromCityId: fromCityId || undefined, ...(near ? { near } : {}) });
  const citiesQuery = cityHooks.useList();
  const carTypesQuery = carTypeHooks.useList();

  // Flatten all loaded pages into one list — see useInfiniteTrips for the page shape.
  const trips = (tripsQuery.data?.pages ?? []).flatMap((p) => p.items);
  const filtered = trips.filter((t) => carTypeId === '' || t.carTypeId === carTypeId);
  const anyFilter = carTypeId !== '' || fromCityId !== '' || near != null;

  function clearFilters() {
    setCarTypeId('');
    setFromCityId('');
    setNear(null);
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-3 bg-surface px-4 py-3 shadow-header">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Open trips</h1>
          <p className="text-xs text-secondary">
            {tripsQuery.isSuccess ? `${filtered.length}${tripsQuery.hasNextPage ? '+' : ''} trip${filtered.length === 1 ? '' : 's'}${near ? ` within ${near.radiusKm} km` : ''} you can apply to` : 'Trips that still need a driver'}
          </p>
        </div>
      </header>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  : 'Try clearing the car-type filter or picking a different pickup city.'
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
          <>
            {filtered.map((t) => <TripCard key={t.id} trip={t} />)}
            <InfiniteScrollSentinel
              hasMore={!!tripsQuery.hasNextPage}
              loading={tripsQuery.isFetchingNextPage}
              onLoadMore={() => void tripsQuery.fetchNextPage()}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default TripFeedPage;
