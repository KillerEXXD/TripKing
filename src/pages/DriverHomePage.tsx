import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Hand, MapPin, Plus, Search, Sparkles, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyDriver } from '@/hooks/useDrivers';
import { useTrips } from '@/hooks/useTrips';
import { useVacancies } from '@/hooks/useVacancies';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { cityHooks } from '@/hooks/useAdminConfig';
import { Badge, Button, Card } from '@/components/ui';
import { GetVerifiedBanner } from '@/components/driver';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR } from '@/lib/utils';
import type { Driver, Trip } from '@/types';

function pickupLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function Bellish({ count }: { count: number }) {
  return (
    <Link to="/notifications" aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'} className="relative -mr-1 flex size-9 items-center justify-center rounded-full text-secondary hover:bg-muted">
      <Bell className="size-5" aria-hidden />
      {count > 0 ? <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" /> : null}
    </Link>
  );
}

function HubTile({ icon, label, tone, to }: { icon: React.ReactNode; label: string; tone: 'violet' | 'emerald' | 'blue'; to: string }) {
  const palette = { violet: 'bg-violet-100 text-violet-700', emerald: 'bg-emerald-100 text-emerald-700', blue: 'bg-blue-100 text-blue-700' };
  return (
    <Link to={to} className="flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-white p-3 text-center transition-colors hover:border-primary/40">
      <span className={`flex size-9 items-center justify-center rounded-full ${palette[tone]}`}>{icon}</span>
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </Link>
  );
}

function ReputationCard({ driver }: { driver: Driver }) {
  return (
    <Link to={`/drivers/${driver.id}`} className="block w-full space-y-2 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors hover:border-primary/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-secondary">Your reputation</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">From passengers</div>
          <div className="flex items-center gap-1 text-sm font-bold">
            <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden />
            {driver.ratingCount > 0 ? `${driver.ratingAvg.toFixed(1)} · ${driver.ratingCount}` : '— · no ratings'}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-secondary">{driver.topTags[0] ?? 'Complete trips to earn tags'}</div>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-800">From agents</div>
          <div className="text-sm font-bold">{driver.totalTripsCompleted} trips</div>
          <div className="mt-0.5 truncate text-[10px] text-secondary">{driver.managerTopTags[0] ?? 'Run agent trips to earn tags'}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-secondary">
        <ChevronRight className="size-3" aria-hidden /> View full profile
      </div>
    </Link>
  );
}

function ActionCard({ tone, icon, title, hint, to }: { tone: 'amber' | 'violet'; icon: React.ReactNode; title: string; hint: string; to: string }) {
  const palette = { amber: { card: 'border-amber-200 bg-amber-50/50', chip: 'bg-amber-100 text-amber-700' }, violet: { card: 'border-violet-200 bg-violet-50/50', chip: 'bg-violet-100 text-violet-700' } };
  const p = palette[tone];
  return (
    <Link to={to} className={`block rounded-2xl border p-4 transition-colors hover:brightness-[0.98] ${p.card}`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${p.chip}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-secondary">{hint}</div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-secondary" aria-hidden />
      </div>
    </Link>
  );
}

function NearbyTripCard({ trip }: { trip: Trip }) {
  return (
    <Link to={`/trips/${trip.id}`} className="block">
      <Card className="gap-2 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">{trip.fromCity.name} → {trip.toCity.name}</div>
            <div className="text-xs text-secondary">{Math.round(trip.expectedDistanceKm)} km · {pickupLabel(trip.pickupAt)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-bold">{formatINR(trip.driverPayout)}</div>
            <div className="text-[10px] text-secondary">incl. {formatINR(trip.driverBata)} bata</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {trip.carTypeLabel ? <Badge variant="outline">{trip.carTypeLabel}</Badge> : null}
          {trip.acRequired ? <Badge variant="outline">AC</Badge> : null}
          <Badge variant={trip.postedByRole === 'driver' ? 'muted' : 'info'}>{trip.postedByRole === 'driver' ? 'Posted by a driver' : 'Posted by an agent'}</Badge>
          {trip.applicantCount > 0 ? <Badge variant="warning"><Sparkles className="size-3" aria-hidden /> {trip.applicantCount} applied</Badge> : null}
        </div>
      </Card>
    </Link>
  );
}

function DriverHome({ driver }: { driver: Driver }) {
  const { user } = useAuth();
  const unread = useUnreadNotificationCount();
  const cities = cityHooks.useList().data ?? [];
  const [nearCityId, setNearCityId] = useState<string>(driver.currentCity?.id ?? driver.homeCity?.id ?? '');
  const nearCity = cities.find((c) => c.id === nearCityId) ?? driver.currentCity ?? driver.homeCity;

  const nearbyQuery = useTrips({ status: ['open', 'has_applicants'], fromCityId: nearCityId || undefined });
  const myPostsQuery = useTrips(user ? { postedByUserId: user.id } : undefined);
  const myVacanciesQuery = useVacancies({ driverId: driver.id, status: 'active' });

  const nearby = nearbyQuery.data ?? [];
  const postedWithApplicants = (myPostsQuery.data ?? []).filter((t) => t.status === 'has_applicants').length;
  const activeVacancies = (myVacanciesQuery.data ?? []).length;

  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{user?.displayName || 'Driver'}</span>
            <Badge variant="success">Driver</Badge>
          </div>
        </div>
        <Bellish count={unread} />
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {driver.verification && <GetVerifiedBanner verification={driver.verification} primaryVehicleId={driver.vehicles[0]?.id} />}
        {nearCity ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 py-1.5 pl-3 pr-2 text-sm text-emerald-700">
            <MapPin className="size-3.5" aria-hidden />
            <span className="font-semibold">Near {nearCity.name}</span>
            {cities.length > 0 ? (
              <select aria-label="Change the area to browse near" value={nearCityId} onChange={(e) => setNearCityId(e.target.value)} className="bg-transparent text-xs text-emerald-700 outline-none">
                <option value="">— anywhere —</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2.5">
          <HubTile icon={<Search className="size-5" aria-hidden />} label="Find a trip" tone="blue" to="/trips" />
          <HubTile icon={<Plus className="size-5" aria-hidden />} label="Post a trip" tone="violet" to="/trips/new" />
          <HubTile icon={<Hand className="size-5" aria-hidden />} label="I'm available" tone="emerald" to="/vacancies/new" />
        </div>

        <ReputationCard driver={driver} />
      </div>

      <div className="px-4 pb-4">
        <InstallAppCard dismissable />
      </div>

      <div className="space-y-3 px-4">
        {postedWithApplicants > 0 ? (
          <ActionCard tone="amber" icon={<Sparkles className="size-5" aria-hidden />} title={`${postedWithApplicants} trip you posted ${postedWithApplicants > 1 ? 'have' : 'has'} applicants`} hint="Review applicants and pick a driver." to="/posted-trips" />
        ) : null}
        {activeVacancies > 0 ? (
          <ActionCard tone="violet" icon={<Hand className="size-5" aria-hidden />} title={`You're showing as available (${activeVacancies})`} hint="Agents can find you in the driver feed." to="/vacancies" />
        ) : null}
      </div>

      <div className="px-4 pt-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Open trips {nearCity ? `near ${nearCity.name}` : 'near you'}</h2>
          {nearbyQuery.isSuccess ? <Badge variant="muted">{nearby.length}</Badge> : null}
        </div>
        {nearbyQuery.isPending ? (
          <LoadingSkeleton rows={3} />
        ) : nearbyQuery.isError ? (
          <ErrorState title="Couldn't load trips" message="Check your connection and try again." onRetry={() => void nearbyQuery.refetch()} />
        ) : nearby.length === 0 ? (
          <Card className="items-center text-center">
            <MapPin className="size-6 opacity-30" aria-hidden />
            <div className="text-sm font-medium">No open trips {nearCity ? `from ${nearCity.name}` : ''} right now</div>
            <div className="text-xs text-secondary">Try another area, or tap “I'm available” so agents can find you.</div>
          </Card>
        ) : (
          <div className="space-y-2">
            {nearby.slice(0, 3).map((t) => (
              <NearbyTripCard key={t.id} trip={t} />
            ))}
            <Button asChild variant="outline" className="w-full">
              <Link to="/trips">{nearby.length > 3 ? `See all ${nearby.length} trips` : 'Browse all open trips'} →</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * `/` for a driver — take-centric home (route the user lands on after sign-in).
 * Header (greeting + bell), 3 actions (Find a trip · Post a trip · I'm available),
 * the reputation card, anything waiting on you, then the open-trips-near-you feed.
 * Built on `useMyDriver` (the caller's profile), `useTrips`, `useVacancies`,
 * `useNotifications`. A 404 (no driver profile) → finish onboarding.
 */
export function DriverHomePage() {
  const navigate = useNavigate();
  const driverQuery = useMyDriver(true);
  const noProfile = driverQuery.isError && driverQuery.error instanceof ApiError && driverQuery.error.status === 404;

  if (noProfile) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <Card className="gap-2">
          <h1 className="text-lg font-bold">Finish setting up your driver profile</h1>
          <p className="text-sm text-secondary">You're signed in, but you don't have a driver profile yet.</p>
          <Button variant="full" size="sm" className="w-fit" onClick={() => navigate('/onboarding')}>
            Set up my profile
          </Button>
        </Card>
      </main>
    );
  }
  if (driverQuery.isPending) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <LoadingSkeleton rows={7} />
      </main>
    );
  }
  if (driverQuery.isError) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <ErrorState title="Couldn't load your home" message="Check your connection and try again." onRetry={() => void driverQuery.refetch()} />
      </main>
    );
  }
  return <DriverHome driver={driverQuery.data} />;
}

export default DriverHomePage;
