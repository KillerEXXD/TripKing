import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  Snowflake,
  MapPin,
  Sparkles,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { useTripStateStore, applyOverlay } from '@/stores/tripStateStore';
import { useMyApplicationsStore, hasActiveApplication } from '@/stores/myApplicationsStore';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LocationSearchPanel,
  type LocationValue,
} from '@/components/location/LocationSearchPanel';
import { mockDrivers } from '@/data/mockData';
import { cn, formatINR, formatKm, haversineKm } from '@/lib/utils';
import { tripApproxDriverCost, tripDriverBata } from '@/lib/tripDefaults';
import { useGoBack } from '@/hooks/useGoBack';
import type { CarType } from '@/types';

const CAR_TYPES: CarType[] = [
  'Hatchback',
  'Sedan',
  'SUV',
  'Innova',
  'Tempo Traveller',
  'Mini Bus',
];

const RADIUS_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Driver-side trip feed.
 *
 * Mirrors the VacanciesPage UX so drivers and managers learn the same
 * pattern: default-filter to the driver's currentCity, contextual heading,
 * location search to widen, radius + car-type chip strips.
 *
 * Trip-status overlay from tripStateStore is applied so trips the manager
 * has cancelled drop out of the feed (drivers shouldn't see cancelled
 * trips in their applyable list).
 */
export function TripFeedPage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/home');
  const { user } = useAuth();
  const { data: rawTrips = [] } = useTrips();
  const overlays = useTripStateStore((s) => s.overlays);
  const applications = useMyApplicationsStore((s) => s.byTrip);

  // Default-filter to the logged-in user's driver-side currentCity.
  const driverHomeCity = useMemo<LocationValue | null>(() => {
    if (!user) return null;
    const d = mockDrivers.find((x) => x.userId === user.id);
    if (!d) return null;
    return {
      name: d.currentCity.name,
      state: d.currentCity.state,
      lat: d.currentCity.lat,
      lng: d.currentCity.lng,
    };
  }, [user]);

  const [filterCity, setFilterCity] = useState<LocationValue | null>(driverHomeCity);
  const [filterRadius, setFilterRadius] = useState<number>(50);
  const [filterCarType, setFilterCarType] = useState<CarType | 'all'>('all');
  const [filterAcOnly, setFilterAcOnly] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Apply persisted manager actions (cancellations / assignments) to the
  // base seed trips, then keep only what's still applyable.
  const applyableTrips = useMemo(() => {
    return rawTrips
      .map((t) => applyOverlay(t, overlays))
      .filter((t) => t.status === 'open' || t.status === 'has_applicants');
  }, [rawTrips, overlays]);

  const filtered = useMemo(() => {
    return applyableTrips
      .filter((t) => {
        if (filterCarType !== 'all' && t.carTypeRequired !== filterCarType) return false;
        if (filterAcOnly && !t.acRequired) return false;
        if (filterCity) {
          const km = haversineKm(
            t.fromCity.lat,
            t.fromCity.lng,
            filterCity.lat,
            filterCity.lng,
          );
          if (km > filterRadius) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.pickupDateTime).getTime() -
          new Date(b.pickupDateTime).getTime(),
      );
  }, [applyableTrips, filterCity, filterRadius, filterCarType, filterAcOnly]);

  const headerTitle = filterCity ? `Trips from ${filterCity.name}` : 'All Trips';
  const headerSubtitle = filterCity
    ? `${filtered.length} within ${filterRadius} km`
    : `${filtered.length} matching across the network`;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">{headerTitle}</h1>
          <div className="text-xs text-muted-foreground">{headerSubtitle}</div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-3 space-y-2">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-input bg-white hover:border-primary/40 transition-colors"
        >
          <Search className="size-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            {filterCity ? (
              <span className="text-sm font-semibold truncate">
                Near {filterCity.name}{' '}
                <span className="text-xs text-muted-foreground font-normal">
                  · within {filterRadius} km
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Filter by pickup city…
              </span>
            )}
          </div>
          {filterCity ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFilterCity(null);
              }}
              className="text-xs text-destructive font-semibold"
            >
              Clear
            </button>
          ) : (
            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {pickerOpen && (
          <LocationSearchPanel
            title="Filter by pickup city"
            placeholder="Where is the trip leaving from?"
            onPick={(loc) => {
              setFilterCity(loc);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {filterCity && (
          <div className="flex gap-1.5">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setFilterRadius(r)}
                className={cn(
                  'flex-1 px-2 py-1 rounded-full text-xs font-semibold border transition-colors',
                  filterRadius === r
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-white hover:border-primary/40',
                )}
              >
                {r} km
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setFilterCarType('all')}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
              filterCarType === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-white hover:border-primary/40',
            )}
          >
            All cars
          </button>
          {CAR_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setFilterCarType(ct)}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                filterCarType === ct
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-white hover:border-primary/40',
              )}
            >
              {ct}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilterAcOnly((v) => !v)}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1',
              filterAcOnly
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'border-border bg-white hover:border-primary/40',
            )}
          >
            <Snowflake className="size-3" /> AC only
          </button>
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-3">
        {filtered.length === 0 ? (
          <Card className="text-center py-10">
            <CardContent className="space-y-2">
              <MapPin className="size-8 mx-auto opacity-30" />
              <div className="font-semibold">
                {filterCity
                  ? `No trips leaving ${filterCity.name} right now`
                  : 'No trips match your filters'}
              </div>
              <div className="text-sm text-muted-foreground">
                {filterCity
                  ? 'Try widening the radius or clearing the location filter.'
                  : 'Try clearing the car-type filter.'}
              </div>
            </CardContent>
          </Card>
        ) : (
          filtered.map((t) => {
            const distanceFromMe = filterCity
              ? haversineKm(
                  t.fromCity.lat,
                  t.fromCity.lng,
                  filterCity.lat,
                  filterCity.lng,
                )
              : null;
            return (
              <Card
                key={t.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => navigate(`/driver/trips/${t.id}`)}
              >
                <CardContent>
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <div className="font-bold">
                        {t.fromCity.name} → {t.toCity.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatKm(t.expectedDistanceKm)} ·{' '}
                        {new Date(t.pickupDateTime).toLocaleString('en-IN', {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'short',
                        })}
                        {distanceFromMe != null && distanceFromMe > 0.5 && (
                          <span className="text-muted-foreground/80">
                            {' '}· {distanceFromMe.toFixed(1)} km from you
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold">{formatINR(tripApproxDriverCost(t))}</div>
                      <div className="text-[10px] text-muted-foreground">
                        payout · ₹{tripDriverBata(t)} bata incl.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline">{t.carTypeRequired}</Badge>
                    {t.acRequired && <Badge variant="outline">AC</Badge>}
                    <Badge variant="muted">₹{t.ratePerKm}/km</Badge>
                    {t.applicantCount > 0 && (
                      <Badge variant="warning" className="flex items-center gap-1">
                        <Sparkles className="size-3" /> {t.applicantCount} applied
                      </Badge>
                    )}
                    {hasActiveApplication(t.id, applications) && (
                      <Badge variant="success">✓ You applied</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
