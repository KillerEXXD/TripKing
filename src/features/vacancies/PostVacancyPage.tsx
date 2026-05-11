import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  Plus,
  X,
  Minus,
  Clock,
  Users,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LocationSearchPanel,
  type LocationValue,
} from '@/components/location/LocationSearchPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useGoBack } from '@/hooks/useGoBack';
import { useActiveVacancies } from '@/hooks/useVacancies';
import { useMyVacanciesStore } from '@/stores/myVacanciesStore';
import { mockCities, mockDrivers } from '@/data/mockData';
import { cn, initials } from '@/lib/utils';
import { toast } from 'sonner';

const QUICK_HOURS = [4, 8, 12, 24] as const;
const MIN_HOURS = 0.5;
const MAX_HOURS = 48;
const STEP_HOURS = 0.5;

function formatTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateLabel(d: Date, ref: Date): string {
  const sameDay = d.toDateString() === ref.toDateString();
  const tomorrow = new Date(ref);
  tomorrow.setDate(ref.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  if (sameDay) return 'today';
  if (isTomorrow) return 'tomorrow';
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

const DEFAULT_FROM: LocationValue = {
  name: mockCities[0]!.name,
  state: mockCities[0]!.state,
  lat: mockCities[0]!.lat,
  lng: mockCities[0]!.lng,
};

/**
 * Post Vacancy form — fully map-driven.
 *
 * BOTH the "from" (current location) and "to" (destinations) inputs use
 * LocationSearchPanel so every saved location carries lat/lng. This
 * unlocks proper radius matching downstream:
 *  - Alerts can fire when a trip's `from` is within N km of the driver's
 *    saved current location, regardless of name spelling.
 *  - Trip Manager's "Find Driver" can rank vacancies by distance from
 *    the trip's pickup point.
 *  - Same shape will be reused by Post Trip + Alert forms later.
 */
export function PostVacancyPage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/home');
  const { user } = useAuth();
  const addVacancy = useMyVacanciesStore((s) => s.addVacancy);
  const { data: activeVacancies = [] } = useActiveVacancies();

  const [from, setFrom] = useState<LocationValue>(DEFAULT_FROM);
  const [destinations, setDestinations] = useState<LocationValue[]>([]);
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [destPickerOpen, setDestPickerOpen] = useState(false);
  const [minRate, setMinRate] = useState('14');
  const [hours, setHours] = useState<number>(8);

  // Tick "now" every minute so the displayed current time stays fresh while
  // the user is on the form.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const until = useMemo(
    () => new Date(now.getTime() + hours * 3600_000),
    [now, hours],
  );

  // Other drivers already free in the selected city — gives the user market
  // context (rate floor, supply density) before they post.
  const peers = useMemo(
    () =>
      activeVacancies.filter(
        (v) =>
          v.driver.id !==
            (mockDrivers.find((d) => d.userId === user?.id)?.id ?? '') &&
          v.currentCity.name.toLowerCase() === from.name.toLowerCase(),
      ),
    [activeVacancies, from.name, user?.id],
  );

  const setHoursClamped = (n: number) => {
    if (Number.isNaN(n)) return;
    setHours(Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(n * 2) / 2)));
  };

  const removeDest = (idx: number) => {
    setDestinations((d) => d.filter((_, i) => i !== idx));
  };

  const addDest = (loc: LocationValue) => {
    setDestinations((d) => {
      // De-dup by lat/lng (avoid same place added twice via slightly different searches)
      const key = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
      const exists = d.some(
        (x) => `${x.lat.toFixed(4)},${x.lng.toFixed(4)}` === key,
      );
      if (exists) return d;
      return [...d, loc];
    });
    setDestPickerOpen(false);
  };

  const submit = () => {
    if (destinations.length === 0) {
      toast.error('Add at least one destination');
      return;
    }
    if (!user) {
      toast.error('Not signed in');
      return;
    }
    const driver = mockDrivers.find((d) => d.userId === user.id);
    if (!driver) {
      toast.error('Driver profile not found');
      return;
    }
    const primaryVehicle = driver.vehicles.find((v) => v.isPrimary) ?? driver.vehicles[0];
    if (!primaryVehicle) {
      toast.error('Add a vehicle before posting a vacancy');
      return;
    }
    const minRateNum = minRate.trim() ? parseFloat(minRate) : undefined;

    addVacancy({
      driverId: driver.id,
      driverName: driver.fullName,
      vehicleId: primaryVehicle.id,
      vehicleLabel: `${primaryVehicle.make} ${primaryVehicle.model} ${primaryVehicle.year}`,
      from,
      destinations,
      availableFrom: now.toISOString(),
      availableUntil: until.toISOString(),
      minRatePerKm: minRateNum,
    });
    toast.success(
      `Vacancy posted — ${from.name} → ${destinations.length} destination${destinations.length > 1 ? 's' : ''}`,
    );
    navigate('/driver/my-vacancies');
  };

  const destExcludeKeys = destinations.map(
    (d) => `${d.lat.toFixed(4)},${d.lng.toFixed(4)}`,
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">Post Vacancy</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* FROM — single map-search */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Current location
            </div>
            <button
              type="button"
              onClick={() => setFromPickerOpen((v) => !v)}
              className="flex items-start gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-input hover:border-primary/40 transition-colors"
            >
              <MapPin className="size-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">
                  {from.name}
                </div>
                {from.displayName && (
                  <div className="text-xs text-muted-foreground truncate">
                    {from.displayName}
                  </div>
                )}
                {!from.displayName && from.state && (
                  <div className="text-xs text-muted-foreground truncate">
                    {from.state}
                  </div>
                )}
              </div>
              <span className="text-xs text-primary font-semibold self-center shrink-0">
                Change
              </span>
            </button>

            {fromPickerOpen && (
              <LocationSearchPanel
                title="Set current location"
                placeholder="Search your current city or area…"
                onPick={(loc) => {
                  setFrom(loc);
                  setFromPickerOpen(false);
                }}
                onClose={() => setFromPickerOpen(false)}
              />
            )}
          </CardContent>
        </Card>

        {/* Peer awareness — drivers already free in the chosen city */}
        <Card className="bg-blue-50/40 border-blue-100">
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-blue-900 font-semibold">
                <Users className="size-3.5" /> Other drivers free in {from.name}
              </div>
              <Badge variant="info">{peers.length}</Badge>
            </div>

            {peers.length === 0 ? (
              <div className="text-xs text-blue-900/70 py-1">
                You'd be the first to post here. Trip managers searching{' '}
                {from.name} will see your card prominently.
              </div>
            ) : (
              <>
                <div className="text-[11px] text-blue-900/70">
                  Posting in a busy city — keep your rate competitive.
                </div>
                <ul className="space-y-1.5">
                  {peers.slice(0, 3).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-blue-100"
                    >
                      <Avatar className="size-7">
                        <AvatarFallback className="text-[10px]">
                          {initials(p.driver.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs truncate">
                          {p.driver.fullName}{' '}
                          <span className="text-muted-foreground font-normal">
                            · {p.vehicle.make} {p.vehicle.model}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {p.driver.ratingCount > 0 ? (
                            <>
                              <Star className="inline size-2.5 fill-amber-500 stroke-amber-500" />{' '}
                              {p.driver.ratingAvg.toFixed(1)} ·
                            </>
                          ) : (
                            'New driver · '
                          )}{' '}
                          {p.destinationCities.length > 0
                            ? `going to ${p.destinationCities.map((d) => d.name).join(', ')}`
                            : 'open to any destination'}
                        </div>
                      </div>
                      {p.minRatePerKm != null && (
                        <Badge variant="muted" className="text-[10px] shrink-0">
                          ≥ ₹{p.minRatePerKm}/km
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
                {peers.length > 3 && (
                  <button
                    type="button"
                    onClick={() => navigate('/driver/vacancies')}
                    className="text-xs text-blue-700 font-semibold hover:underline"
                  >
                    See all {peers.length} drivers in {from.name} →
                  </button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* TO — multi map-search with chips */}
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Willing to go to
              </div>
              <Badge variant="muted">{destinations.length} added</Badge>
            </div>

            {destinations.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                No destinations yet. Tap "Add destination" to search.
              </div>
            ) : (
              <ul className="space-y-2">
                {destinations.map((d, i) => (
                  <li
                    key={`${d.lat}-${d.lng}-${i}`}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100"
                  >
                    <MapPin className="size-4 text-emerald-700 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-emerald-900 truncate">
                        {d.name}
                      </div>
                      {d.displayName && (
                        <div className="text-xs text-emerald-700/80 truncate">
                          {d.displayName}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDest(i)}
                      className="text-emerald-700/70 hover:text-emerald-900 p-1 -mr-1 -mt-0.5 shrink-0"
                      aria-label={`Remove ${d.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDestPickerOpen((v) => !v)}
              className="w-full"
            >
              <Plus className="size-4" /> Add destination
            </Button>

            {destPickerOpen && (
              <LocationSearchPanel
                title="Add a destination"
                placeholder="Search where you can drive to…"
                onPick={addDest}
                onClose={() => setDestPickerOpen(false)}
                excludeKeys={destExcludeKeys}
              />
            )}
          </CardContent>
        </Card>

        {/* Rate */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Minimum rate per KM (optional)
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                ₹
              </span>
              <Input
                type="number"
                value={minRate}
                onChange={(e) => setMinRate(e.target.value)}
                placeholder="14"
                className="pl-7"
                inputMode="numeric"
              />
            </div>
          </CardContent>
        </Card>

        {/* Availability — interactive */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Available
            </div>

            {/* From / Until summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 border border-input rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  From
                </div>
                <div className="font-semibold text-sm">Now</div>
                <div className="text-xs text-muted-foreground">{formatTime(now)}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
                  Until
                </div>
                <div className="font-semibold text-sm text-emerald-900">
                  {formatTime(until)}
                </div>
                <div className="text-xs text-emerald-700/80">
                  {formatDateLabel(until, now)}
                </div>
              </div>
            </div>

            {/* Hours stepper */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                For
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setHoursClamped(hours - STEP_HOURS)}
                  disabled={hours <= MIN_HOURS}
                  aria-label="Decrease hours"
                >
                  <Minus className="size-4" />
                </Button>
                <div className="relative flex-1">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={STEP_HOURS}
                    min={MIN_HOURS}
                    max={MAX_HOURS}
                    value={hours}
                    onChange={(e) => setHoursClamped(parseFloat(e.target.value))}
                    className="pl-9 pr-12 text-center font-semibold"
                    aria-label="Hours available"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    hours
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setHoursClamped(hours + STEP_HOURS)}
                  disabled={hours >= MAX_HOURS}
                  aria-label="Increase hours"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHoursClamped(h)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                    hours === h
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-white hover:border-primary/40',
                  )}
                >
                  {h}h
                </button>
              ))}
              <Badge variant="muted" className="ml-auto self-center">
                step 30 min
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4">
        <Button variant="full" size="lg" className="w-full" onClick={submit}>
          POST VACANCY
        </Button>
      </div>
    </div>
  );
}
