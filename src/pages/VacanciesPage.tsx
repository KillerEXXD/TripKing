import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, MapPin, Star } from 'lucide-react';
import { useVacancies } from '@/hooks/useVacancies';
import { cityHooks } from '@/hooks/useAdminConfig';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { Vacancy } from '@/types';

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function availableLabel(v: Vacancy): string {
  return v.availableUntil ? `${shortDate(v.availableFrom)} – ${shortDate(v.availableUntil)}` : `from ${shortDate(v.availableFrom)}`;
}
function vehicleLabel(v: Vacancy): string | null {
  if (!v.vehicle) return null;
  const name = [v.vehicle.makeLabel, v.vehicle.modelName].filter(Boolean).join(' ');
  return [name || null, v.vehicle.carTypeLabel ?? null, `${v.vehicle.seats} seats`, v.vehicle.ac ? 'AC' : 'Non-AC'].filter(Boolean).join(' · ');
}

function VacancyCard({ vacancy }: { vacancy: Vacancy }) {
  const driver = vacancy.driver;
  const veh = vehicleLabel(vacancy);
  return (
    <Link to={`/drivers/${vacancy.driverId}`} className="block">
      <Card className="gap-3 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold">{driver?.fullName || 'A driver'}</div>
            <div className="text-xs text-secondary">
              {driver && driver.ratingCount > 0 ? (
                <>
                  <span className="font-semibold text-amber-600">★ {driver.ratingAvg.toFixed(1)}</span> · {driver.ratingCount} · {driver.totalTripsCompleted} trips ·{' '}
                </>
              ) : null}
              <MapPin className="-mt-0.5 inline size-3" aria-hidden /> Available in {vacancy.currentCity.name} · {availableLabel(vacancy)}
            </div>
          </div>
          {vacancy.minRatePerKm ? <Badge variant="muted">≥ {formatINR(vacancy.minRatePerKm)}/km</Badge> : null}
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
      </Card>
    </Link>
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
  const vacanciesQuery = useVacancies({ status: 'active', currentCityId: currentCityId || undefined, destinationCityId: destinationCityId || undefined });
  const citiesQuery = cityHooks.useList();
  const vacancies = vacanciesQuery.data ?? [];

  const chipSelect = 'h-8 rounded-full border border-input bg-white px-3 text-xs';
  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Available drivers</h1>
          <p className="text-xs text-secondary">{vacanciesQuery.isSuccess ? `${vacancies.length} driver${vacancies.length === 1 ? '' : 's'} available` : 'Drivers who have posted their availability'}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/vacancies/new">Post availability</Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5">
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
        {currentCityId || destinationCityId ? (
          <button
            type="button"
            onClick={() => {
              setCurrentCityId('');
              setDestinationCityId('');
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
          <ErrorState title="Couldn't load available drivers" message="Check your connection and try again." onRetry={() => void vacanciesQuery.refetch()} />
        ) : vacancies.length === 0 ? (
          <EmptyState
            icon={<Star className="size-7" />}
            title={currentCityId || destinationCityId ? 'No drivers match those filters' : 'No drivers have posted availability yet'}
            message={currentCityId || destinationCityId ? 'Try widening the filters.' : 'When a driver posts their availability it shows up here.'}
          />
        ) : (
          vacancies.map((v) => <VacancyCard key={v.id} vacancy={v} />)
        )}
      </div>
    </div>
  );
}

export default VacanciesPage;
