import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Car, MapPin, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { useVacancies } from '@/hooks/useVacancies';
import { useMyDriver } from '@/hooks/useDrivers';
import { useTrips } from '@/hooks/useTrips';
import { useInviteDrivers } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { cityHooks } from '@/hooks/useAdminConfig';
import { NearMeFilter } from '@/components/location/NearMeFilter';
import { IAmAvailableCard } from '@/components/vacancy/IAmAvailableCard';
import { DriverIdentity } from '@/components/driver/DriverIdentity';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatClockTime, formatINR, formatShortDate } from '@/lib/utils';
import type { NearRadius, Trip, Vacancy } from '@/types';

function availableLabel(v: Vacancy): string {
  const from = new Date(v.availableFrom);
  if (Number.isNaN(from.getTime())) return v.availableFrom;
  const to = v.availableUntil ? new Date(v.availableUntil) : null;
  if (!to || Number.isNaN(to.getTime())) return `from ${formatShortDate(from)}, ${formatClockTime(from)}`;
  const sameDay = from.toDateString() === to.toDateString();
  return sameDay
    ? `${formatShortDate(from)}, ${formatClockTime(from)} – ${formatClockTime(to)}`
    : `${formatShortDate(from)} ${formatClockTime(from)} – ${formatShortDate(to)} ${formatClockTime(to)}`;
}
function vehicleLabel(v: Vacancy): string | null {
  if (!v.vehicle) return null;
  const name = [v.vehicle.makeLabel, v.vehicle.modelName].filter(Boolean).join(' ');
  return [name || null, v.vehicle.carTypeLabel ?? null, `${v.vehicle.seats} seats`, v.vehicle.ac ? 'AC' : 'Non-AC'].filter(Boolean).join(' · ');
}

function VacancyCard({ vacancy, canInvite }: { vacancy: Vacancy; canInvite: boolean }) {
  const driver = vacancy.driver;
  const veh = vehicleLabel(vacancy);
  const [inviteOpen, setInviteOpen] = useState(false);
  const ratingSub =
    driver && driver.ratingCount > 0
      ? `★ ${driver.ratingAvg.toFixed(1)} · ${driver.ratingCount} · ${driver.totalTripsCompleted} trips`
      : null;
  return (
    <Card className="gap-3 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/drivers/${vacancy.driverId}`} className="min-w-0 flex-1">
          <DriverIdentity driver={driver} sub={ratingSub} />
        </Link>
        {vacancy.minRatePerKm ? <Badge variant="muted">≥ {formatINR(vacancy.minRatePerKm)}/km</Badge> : null}
      </div>
      <div className="text-xs text-secondary">
        <MapPin className="-mt-0.5 inline size-3" aria-hidden /> Vacant in {vacancy.currentPlace?.name ?? vacancy.currentCity.name} · {availableLabel(vacancy)}
        {vacancy.distanceKm != null ? ` · ${vacancy.distanceKm} km away` : ''}
      </div>
      {vacancy.destinationCities.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-secondary">Will drive to:</span>
          {vacancy.destinationCities.map((c) => (
            <Badge key={c.id} variant="outline">
              {c.name}
            </Badge>
          ))}
        </div>
      ) : null}
      {veh ? (
        <div className="flex items-center gap-2 text-xs text-secondary">
          <Car className="size-3.5" aria-hidden /> {veh}
        </div>
      ) : null}
      {vacancy.notes ? <p className="text-sm text-secondary">{vacancy.notes}</p> : null}
      {canInvite ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
            Invite to trip
          </Button>
          {inviteOpen ? <InviteToTripDialog vacancy={vacancy} open={inviteOpen} onClose={() => setInviteOpen(false)} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Pick one of the agent's open trips and fire `POST /vacancy-invitations`. Pre-reveal — the dialog
 * never shows the driver's name, only their handle (the same one the card surfaces).
 */
function InviteToTripDialog({ vacancy, open, onClose }: { vacancy: Vacancy; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const myUserId = user?.id ?? '';
  // Only trips the caller owns + still accepting applicants are eligible.
  const trips = useTrips({ status: ['open', 'has_applicants'], postedByUserId: myUserId });
  const inviteDrivers = useInviteDrivers();
  const eligible = (trips.data ?? []).filter((t) => t.status === 'open' || t.status === 'has_applicants');
  const handle = vacancy.driver?.displayHandle ?? '';
  const driverId = vacancy.driver?.id ?? '';
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Invite {handle ? `driver ${handle}` : 'this driver'} to a trip</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-secondary">Pick one of your open trips. The driver gets a notification and can accept or decline.</Dialog.Description>
            </div>
            <button onClick={onClose} className="rounded p-1 text-secondary hover:bg-muted" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {trips.isPending ? (
              <LoadingSkeleton rows={3} />
            ) : eligible.length === 0 ? (
              <EmptyState title="No open trips" message="Post a trip first, then invite a driver to it." />
            ) : (
              eligible.map((t) => (
                <TripPickRow
                  key={t.id}
                  trip={t}
                  disabled={inviteDrivers.isPending || !driverId}
                  onPick={() => {
                    if (!driverId) return;
                    inviteDrivers.mutate(
                      { tripId: t.id, driverIds: [driverId] },
                      {
                        onSuccess: (r) => {
                          if (r.created.length > 0) {
                            toast.success('Invitation sent');
                            onClose();
                          } else if (r.skipped.length > 0) {
                            // The radius gate (or KYC / inactive) skipped the driver.
                            toast.error('Driver is outside the invite radius from this trip\'s pickup, or no longer eligible.');
                          } else {
                            toast.error('Could not send the invitation');
                          }
                        },
                        onError: (e: unknown) => {
                          const msg = e instanceof Error ? e.message : 'Could not send the invitation';
                          toast.error(msg);
                        },
                      },
                    );
                  }}
                />
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TripPickRow({ trip, disabled, onPick }: { trip: Trip; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {trip.fromCity.name} → {trip.toCity.name}
        </div>
        <div className="text-xs text-secondary">
          {formatShortDate(new Date(trip.pickupAt))} · {formatClockTime(new Date(trip.pickupAt))} · {formatINR(trip.driverPayout)}
        </div>
      </div>
      <Badge variant="outline">Invite</Badge>
    </button>
  );
}

/**
 * `/vacancies` — the driver-availability feed: drivers who've posted "I'm in
 * city X, available [dates], willing to drive to [cities]". Agents browse this
 * to line up a driver. Server-filtered by current city / destination city via
 * `useVacancies`; cards link to the driver's profile. (Posting a vacancy is a
 * driver action — its screen lands separately.)
 */
export function VacanciesPage() {
  const [currentCityId, setCurrentCityId] = useState('');
  const [destinationCityId, setDestinationCityId] = useState('');
  const [near, setNear] = useState<NearRadius | null>(null);
  const vacanciesQuery = useVacancies({ status: 'active', currentCityId: currentCityId || undefined, destinationCityId: destinationCityId || undefined, ...(near ? { near } : {}) });
  const citiesQuery = cityHooks.useList();
  const vacancies = vacanciesQuery.data ?? [];
  const anyFilter = !!currentCityId || !!destinationCityId || near != null;

  // Driver-only "I'm available" card. Admins viewing-as-agent (or anyone non-driver) see only the list.
  // The role gate matches the pattern used by HomeForRole + BottomNav (src/stores/roleViewStore.ts).
  const effectiveRole = useEffectiveRole();
  const isDriverView = effectiveRole === 'driver';
  const myDriver = useMyDriver(isDriverView);
  const myDriverId = myDriver.data?.id;
  // Agents (and admins viewing-as-agent) can invite a driver to one of their open trips.
  const canInvite = effectiveRole === 'trip_manager' || effectiveRole === 'admin';

  const chipSelect = 'h-8 rounded-full border border-input bg-white px-3 text-xs';
  return (
    <div className="mx-auto max-w-md">
      <header className="border-b bg-white px-4 py-3">
        <h1 className="text-base font-semibold">Vacant drivers</h1>
        <p className="text-xs text-secondary">
          {vacanciesQuery.isSuccess ? `${vacancies.length} vacant driver${vacancies.length === 1 ? '' : 's'}${near ? ` within ${near.radiusKm} km` : ''}` : 'Drivers who have posted their availability'}
        </p>
      </header>

      {isDriverView && myDriverId ? <IAmAvailableCard driverId={myDriverId} /> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5">
        <label className="sr-only" htmlFor="vac-current">
          Filter by where the driver is
        </label>
        <select id="vac-current" value={currentCityId} onChange={(e) => setCurrentCityId(e.target.value)} className={chipSelect}>
          <option value="">Driver in any city</option>
          {(citiesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="vac-dest">
          Filter by destination
        </label>
        <select id="vac-dest" value={destinationCityId} onChange={(e) => setDestinationCityId(e.target.value)} className={chipSelect}>
          <option value="">Going anywhere</option>
          {(citiesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <NearMeFilter value={near} onChange={setNear} />
        {anyFilter ? (
          <button
            type="button"
            onClick={() => {
              setCurrentCityId('');
              setDestinationCityId('');
              setNear(null);
            }}
            className="h-8 rounded-full border border-input bg-white px-3 text-xs font-medium"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        {vacanciesQuery.isPending ? (
          <LoadingSkeleton rows={5} />
        ) : vacanciesQuery.isError ? (
          <ErrorState title="Couldn't load vacant drivers" message="Check your connection and try again." onRetry={() => void vacanciesQuery.refetch()} />
        ) : vacancies.length === 0 ? (
          <EmptyState
            icon={<Star className="size-7" />}
            title={anyFilter ? 'No drivers match those filters' : 'No drivers have posted availability yet'}
            message={anyFilter ? (near ? 'Try a bigger radius, or clear the location filter.' : 'Try widening the filters.') : 'When a driver posts their availability it shows up here.'}
          />
        ) : (
          vacancies.map((v) => <VacancyCard key={v.id} vacancy={v} canInvite={canInvite} />)
        )}
      </div>
    </div>
  );
}

export default VacanciesPage;
