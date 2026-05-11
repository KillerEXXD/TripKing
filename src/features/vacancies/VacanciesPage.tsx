import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Star,
  Clock,
  Car,
  Users,
  Snowflake,
  Wallet,
  Search,
  ChevronDown,
  Phone,
  Send,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LocationSearchPanel,
  type LocationValue,
} from '@/components/location/LocationSearchPanel';
import { useActiveVacancies } from '@/hooks/useVacancies';
import { useGoBack } from '@/hooks/useGoBack';
import { useAuth } from '@/contexts/AuthContext';
import { useMyVacanciesStore, isVacancyActive } from '@/stores/myVacanciesStore';
import { haversineKm, initials, cn } from '@/lib/utils';
import type { CarType } from '@/types';
import type { VacancyWithDriver } from '@/lib/api/services/vacancies';
import { mockDrivers } from '@/data/mockData';

const CAR_TYPES: CarType[] = [
  'Hatchback',
  'Sedan',
  'SUV',
  'Innova',
  'Tempo Traveller',
  'Mini Bus',
];

interface Props {
  /** Drives header copy + the primary action shown on each card. */
  role: 'driver' | 'manager';
}

function timeUntil(iso: string, now: number): string {
  const diffMs = new Date(iso).getTime() - now;
  if (diffMs <= 0) return 'expiring';
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h`;
  return `${Math.round(hrs / 24)}d`;
}

/**
 * Vacancies feed.
 *
 * Two consumers, same component:
 *  - Trip Manager → "Find Driver" — filter by location radius + car type to
 *    discover available drivers when a trip needs an assignee.
 *  - Driver → "Vacancies" — peer-awareness of who else is free in their city.
 *
 * Each card surfaces driver name + ★ rating + recent trip count + vehicle
 * (make/model/year/type/AC) + destinations + availability countdown +
 * optional rate floor. Manager-side adds quick "Message" / "Call" CTAs.
 */
export function VacanciesPage({ role }: Props) {
  const navigate = useNavigate();
  const goBack = useGoBack('/home');
  const { user } = useAuth();
  const { data: seedVacancies = [], isLoading } = useActiveVacancies();
  const myVacancies = useMyVacanciesStore((s) => s.vacancies);

  // Drivers land here pre-filtered to their own city — they care about who's
  // free near them. Managers land unfiltered (they're often searching for
  // a specific other city the trip leaves from).
  const driverHomeCity = useMemo<LocationValue | null>(() => {
    if (role !== 'driver' || !user) return null;
    const d = mockDrivers.find((x) => x.userId === user.id);
    if (!d) return null;
    return {
      name: d.currentCity.name,
      state: d.currentCity.state,
      lat: d.currentCity.lat,
      lng: d.currentCity.lng,
    };
  }, [role, user]);

  const [filterCity, setFilterCity] = useState<LocationValue | null>(driverHomeCity);
  const [filterRadius, setFilterRadius] = useState<number>(50);
  const [filterCarType, setFilterCarType] = useState<CarType | 'all'>('all');
  const [filterAcOnly, setFilterAcOnly] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const now = Date.now();

  // Adapt locally-stored MyVacancies into the same VacancyWithDriver shape used
  // by the public feed, so user posts mingle with seed data without a fork.
  const myAsVacancies = useMemo<(VacancyWithDriver & { isMine?: boolean })[]>(() => {
    if (!user) return [];
    const driver = mockDrivers.find((d) => d.userId === user.id);
    if (!driver) return [];
    return myVacancies
      .filter((v) => isVacancyActive(v, now))
      .map((v) => {
        const vehicle = driver.vehicles.find((vh) => vh.id === v.vehicleId)
          ?? driver.vehicles[0]!;
        return {
          isMine: true,
          id: v.id,
          driverId: driver.id,
          vehicleId: vehicle.id,
          currentCity: {
            id: 'live',
            name: v.from.name,
            state: v.from.state ?? '',
            lat: v.from.lat,
            lng: v.from.lng,
          },
          availableFrom: v.availableFrom,
          availableUntil: v.availableUntil,
          destinationCities: v.destinations.map((d, i) => ({
            id: `live-${i}`,
            name: d.name,
            state: d.state ?? '',
            lat: d.lat,
            lng: d.lng,
          })),
          minRatePerKm: v.minRatePerKm,
          notes: v.notes,
          status: 'active',
          driver: {
            id: driver.id,
            fullName: driver.fullName,
            profilePhotoUrl: driver.profilePhotoUrl,
            ratingAvg: driver.ratingAvg,
            ratingCount: driver.ratingCount,
            totalTripsCompleted: driver.totalTripsCompleted,
            topTags: driver.topTags,
          },
          vehicle: {
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            carType: vehicle.carType,
            seats: vehicle.seats,
            ac: vehicle.ac,
            fuelType: vehicle.fuelType,
          },
        } as VacancyWithDriver & { isMine: boolean };
      });
  }, [myVacancies, now, user]);

  // The current driver may also appear in seed data (mock fixtures). Mark
  // every card whose driver is the logged-in user as `isMine` so they all
  // get the highlight + tap-to-manage behaviour, regardless of source.
  const myDriverId = user
    ? mockDrivers.find((d) => d.userId === user.id)?.id
    : undefined;

  const vacancies = useMemo(() => {
    const myIds = new Set(myAsVacancies.map((v) => v.id));
    const seed: (VacancyWithDriver & { isMine?: boolean })[] = seedVacancies
      .filter((v) => !myIds.has(v.id))
      .map((v) => ({
        ...v,
        isMine: myDriverId != null && v.driver.id === myDriverId,
      }));
    // User's own posts always at the top so they can find them quickly.
    const merged = [...myAsVacancies, ...seed];
    return merged.sort((a, b) => Number(b.isMine ?? false) - Number(a.isMine ?? false));
  }, [myAsVacancies, seedVacancies, myDriverId]);

  const filtered = useMemo(() => {
    return vacancies.filter((v) => {
      if (filterCarType !== 'all' && v.vehicle.carType !== filterCarType) return false;
      if (filterAcOnly && !v.vehicle.ac) return false;
      if (filterCity) {
        const km = haversineKm(
          v.currentCity.lat,
          v.currentCity.lng,
          filterCity.lat,
          filterCity.lng,
        );
        if (km > filterRadius) return false;
      }
      return true;
    });
  }, [vacancies, filterCity, filterRadius, filterCarType, filterAcOnly]);

  // Context-aware heading. When filtered by a city, both roles get a
  // location-anchored title so it reads naturally on the screen.
  const headerTitle = filterCity
    ? `Drivers vacant in ${filterCity.name}`
    : role === 'manager'
      ? 'Find Driver'
      : 'Available Drivers';

  const headerSubtitle = filterCity
    ? `${filtered.length} within ${filterRadius} km${role === 'driver' ? ' of you' : ''}`
    : role === 'manager'
      ? `${filtered.length} drivers available now`
      : `${filtered.length} drivers in network`;

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
                Filter by location…
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
            title="Filter by location"
            placeholder="Where do you need drivers?"
            onPick={(loc) => {
              setFilterCity(loc);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {filterCity && (
          <div className="flex gap-1.5">
            {[10, 25, 50, 100].map((r) => (
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
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Loading vacancies…
          </div>
        ) : filtered.length === 0 ? (
          <Card className="text-center py-10">
            <CardContent className="space-y-2">
              <Car className="size-8 mx-auto opacity-30" />
              <div className="font-semibold">No drivers match your filters</div>
              <div className="text-sm text-muted-foreground">
                Try widening the radius or clearing the car-type filter.
              </div>
            </CardContent>
          </Card>
        ) : (
          filtered.map((v) => {
            const distanceKm = filterCity
              ? haversineKm(
                  v.currentCity.lat,
                  v.currentCity.lng,
                  filterCity.lat,
                  filterCity.lng,
                )
              : null;
            return (
              <Card
                key={v.id}
                className={cn(
                  'hover:border-primary/40 transition-colors cursor-pointer',
                  v.isMine && 'border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200',
                )}
                onClick={() =>
                  v.isMine
                    ? navigate('/driver/my-vacancies')
                    : navigate(`/drivers/${v.driver.id}`)
                }
              >
                <CardContent className="space-y-3">
                  {/* Driver header */}
                  <div className="flex items-center gap-3">
                    <Avatar className="size-12">
                      <AvatarFallback className="text-sm">
                        {initials(v.driver.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate flex items-center gap-1.5">
                        {v.driver.fullName}
                        {v.isMine && (
                          <Badge variant="success" className="text-[9px]">
                            Your post
                          </Badge>
                        )}
                      </div>
                      {v.driver.ratingCount > 0 ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Star className="size-3 fill-amber-500 stroke-amber-500" />
                          <span className="font-semibold text-amber-600">
                            {v.driver.ratingAvg.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground">
                            · {v.driver.totalTripsCompleted} trips
                          </span>
                        </div>
                      ) : (
                        <Badge variant="info" className="text-[10px]">
                          New driver · {v.driver.totalTripsCompleted} trips
                        </Badge>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Free for
                      </div>
                      <div className="font-bold text-sm flex items-center gap-1 text-emerald-700">
                        <Clock className="size-3.5" />
                        {timeUntil(v.availableUntil ?? '', now)}
                      </div>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                    <div className="flex items-start gap-2">
                      <MapPin className="size-4 text-emerald-700 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
                          Currently in
                        </div>
                        <div className="font-bold text-sm">
                          {v.currentCity.name}
                          {distanceKm != null && (
                            <span className="text-xs font-normal text-muted-foreground ml-2">
                              · {distanceKm.toFixed(1)} km from you
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 pl-6">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        Will drive to
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {v.destinationCities.map((c) => (
                          <Badge key={c.id} variant="outline" className="text-xs">
                            {c.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Vehicle */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Stat
                      icon={<Car className="size-3.5" />}
                      label="Vehicle"
                      value={`${v.vehicle.make} ${v.vehicle.model} ${v.vehicle.year}`}
                    />
                    <Stat
                      icon={<Users className="size-3.5" />}
                      label="Capacity"
                      value={`${v.vehicle.seats} seats${v.vehicle.ac ? ' · AC' : ''}`}
                    />
                    <Stat
                      label="Type"
                      value={v.vehicle.carType}
                      icon={<Car className="size-3.5" />}
                    />
                    {v.minRatePerKm != null && (
                      <Stat
                        icon={<Wallet className="size-3.5" />}
                        label="Min rate"
                        value={`₹${v.minRatePerKm}/km`}
                      />
                    )}
                  </div>

                  {/* Top tags */}
                  {v.driver.topTags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {v.driver.topTags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="success" className="text-[10px]">
                          ★ {t}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {v.notes && (
                    <p className="text-xs italic text-muted-foreground">
                      "{v.notes}"
                    </p>
                  )}

                  {/* Actions */}
                  {role === 'manager' && (
                    <div className="flex gap-2 pt-1 border-t">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/manager/posted-trips');
                        }}
                      >
                        <Send className="size-3.5" /> Send a trip
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Phone className="size-3.5" /> Call
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}
