import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, ChevronRight, Clock, MapPin, Navigation, Sparkles, Star, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { NearCityPicker } from '@/components/location/NearCityPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useMyDriver } from '@/hooks/useDrivers';
import { useCompleteTrip, useMyApplications, useTrips } from '@/hooks/useTrips';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { cityHooks } from '@/hooks/useAdminConfig';
import { IAmAvailableCard } from '@/components/vacancy/IAmAvailableCard';
import { Badge, Button, Card } from '@/components/ui';
import { GetVerifiedBanner } from '@/components/driver';
import { InvitesSentCard } from '@/components/home/InvitesSentCard';
import { InvitesReceivedCard } from '@/components/home/InvitesReceivedCard';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR, formatPickupTime, getFirstName, initials } from '@/lib/utils';
import type { Driver, MyApplication, Trip } from '@/types';

function ProfileAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  return (
    <Link to="/profile" aria-label="Your profile" className="flex size-9 items-center justify-center overflow-hidden rounded-full border bg-primary/15 text-sm font-bold text-primary hover:ring-2 hover:ring-primary/40">
      {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : <span>{name ? initials(name) : '?'}</span>}
    </Link>
  );
}
function Bellish({ count }: { count: number }) {
  return (
    <Link to="/notifications" aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'} className="relative -mr-1 flex size-9 items-center justify-center rounded-full text-secondary hover:bg-muted">
      <Bell className="size-5" aria-hidden />
      {count > 0 ? <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" /> : null}
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
            <div className="text-xs text-secondary">{Math.round(trip.expectedDistanceKm)} km · {formatPickupTime(trip.pickupAt)}</div>
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

/**
 * Top-of-home card for a trip the driver is actively running (`status='in_progress'`).
 * Always the highest priority — supersedes every other home card while live.
 */
/** Top-of-home card — always rendered. When the driver has no in-progress trip,
 *  shows an empty-state explaining what will appear here. With one in-progress
 *  trip, surfaces the route + distance + payout + pickup time + passenger count
 *  inline so the driver doesn't have to drill in to see them, plus an End trip
 *  shortcut so they can complete the trip without an extra screen. */
function CurrentTripCard({ trip }: { trip: Trip | undefined }) {
  const navigate = useNavigate();
  const completeMutation = useCompleteTrip();
  if (!trip) {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <Navigation className="size-3.5" aria-hidden /> Driving now
        </div>
        <div className="mt-1 text-sm font-medium text-slate-700">No trip in progress</div>
        <div className="mt-0.5 text-xs text-slate-500">
          When you start a trip, it'll show up here so you can continue, track the route, and complete it.
        </div>
      </div>
    );
  }
  const tripId = trip.id;
  async function onEnd(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm('End this trip now? Your payout will be queued.')) return;
    try {
      await completeMutation.mutateAsync({ tripId });
      toast.success('Trip completed — your payout is queued.');
    } catch {
      toast.error("Couldn't complete the trip — please try again.");
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/trips/${trip.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/trips/${trip.id}`); } }}
      aria-label={`Open trip ${trip.fromCity.name} to ${trip.toCity.name}`}
      className="block cursor-pointer rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
            <Navigation className="size-3.5" aria-hidden /> Driving now
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-950">
            {trip.fromCity.name} → {trip.toCity.name}
          </div>
          <div className="mt-0.5 text-xs text-emerald-800">
            {Math.round(trip.expectedDistanceKm)} km · {formatINR(trip.driverPayout)} payout
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button size="sm" variant="outline" className="bg-white" onClick={onEnd} disabled={completeMutation.isPending}>
            {completeMutation.isPending ? 'Ending…' : 'End trip'}
          </Button>
          <Button asChild size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800">
            <Link to={`/trips/${trip.id}`} onClick={(e) => e.stopPropagation()}>Continue</Link>
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-emerald-200 pt-2.5 text-xs text-emerald-900">
        <CurrentTripStat icon={<Clock className="size-3.5" aria-hidden />} label="Pickup" value={formatPickupTime(trip.pickupAt)} />
        <CurrentTripStat icon={<Navigation className="size-3.5" aria-hidden />} label="To destination" value={trip.distanceToDestinationKm ? `${Math.round(trip.distanceToDestinationKm)} km` : '—'} />
        <CurrentTripStat icon={<Users className="size-3.5" aria-hidden />} label="Passenger" value={`${trip.passengerCount} ${trip.passengerCount === 1 ? 'pax' : 'pax'}`} />
      </div>
    </div>
  );
}

function CurrentTripStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 text-emerald-700" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-emerald-700/80">{label}</div>
        <div className="truncate font-semibold">{value}</div>
      </div>
    </div>
  );
}

/**
 * Driver has accepted but hasn't yet entered the OTP + odometer to start (`status='accepted'`).
 * Amber to nudge action but distinct from the live-in-progress emerald.
 */
function AssignedTripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      to={`/trips/${trip.id}`}
      className="block rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">
        <CheckCircle2 className="size-3.5" aria-hidden /> Ready to start
      </div>
      <div className="mt-1 text-lg font-bold text-amber-950">
        {trip.fromCity.name} → {trip.toCity.name}
      </div>
      <div className="mt-0.5 text-xs text-amber-800">
        Pickup: {formatPickupTime(trip.pickupAt)} · {Math.round(trip.expectedDistanceKm)} km
      </div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-700 px-4 py-1.5 text-sm font-semibold text-white">
        Start the trip <ChevronRight className="size-4" aria-hidden />
      </div>
    </Link>
  );
}

/**
 * Trips an agent has selected the driver for, awaiting accept/decline. These live in
 * `trip_acceptances` with `status='selected'` — sourced from `useMyApplications` and
 * filtered client-side. (We could add `?status=selected` to the API later if list size
 * becomes a concern.)
 */
function AwaitingMyDecisionCard({ apps }: { apps: MyApplication[] }) {
  if (apps.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <Sparkles className="size-3.5" aria-hidden /> Review
        </div>
        <div className="mt-1 text-sm font-medium text-slate-700">No trips waiting for your decision</div>
        <div className="mt-0.5 text-xs text-slate-500">
          When an agent picks you for a trip you applied to, it'll show up here so you can Accept or Decline.
        </div>
      </div>
    );
  }
  const first = apps[0]!;
  const more = apps.length - 1;
  // One trip → land directly on its detail so the driver can Accept / Decline in one tap.
  // Multiple → focused list at /my-trips/review with the rich applicant-style cards.
  const href = apps.length === 1 ? `/trips/${first.trip.id}` : '/my-trips/review';
  return (
    <Link
      to={href}
      state={{ from: 'home' }}
      className="block rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 transition-colors hover:bg-blue-100"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-blue-700">
        <Sparkles className="size-3.5" aria-hidden /> {apps.length} trip{apps.length === 1 ? '' : 's'} waiting for your decision
      </div>
      <div className="mt-1 text-base font-bold text-blue-950">
        {first.trip.fromCity.name} → {first.trip.toCity.name}
      </div>
      <div className="mt-0.5 text-xs text-blue-800">
        Pickup: {formatPickupTime(first.trip.pickupAt)}{more > 0 ? ` · +${more} more` : ''}
      </div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white">
        Review <ChevronRight className="size-4" aria-hidden />
      </div>
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
  const myDrivingQuery = useTrips({ assignedDriverId: 'me' });
  const myApplicationsQuery = useMyApplications();
  const invitedToDriveQuery = useTrips({ invited: 'me' });

  const nearby = nearbyQuery.data ?? [];
  const myPosts = myPostsQuery.data ?? [];
  const postedWithApplicants = myPosts.filter((t) => t.status === 'has_applicants').length;
  const hasPendingInvites = myPosts.some((t) => (t.pendingInvitationCount ?? 0) > 0);
  // Belt-and-braces: also exclude trips the driver has already applied to. The backend trigger
  // sync_trip_invitation_on_apply (migration 033) flips the invitation pending → applied when
  // the driver applies, but a re-invite from the agent rewrites the row back to pending — this
  // client-side guard hides those without depending on a clean backend state.
  const appliedTripIds = new Set((myApplicationsQuery.data ?? []).map((a) => a.trip.id));
  const pendingReceivedInvites = (invitedToDriveQuery.data ?? []).filter(
    (t) => t.invitationStatus === 'pending' && !appliedTripIds.has(t.id),
  );

  // Priority cards: a driver has at most one trip in each of these states at a time.
  const myDriving = myDrivingQuery.data ?? [];
  const inProgressTrip = myDriving.find((t) => t.status === 'in_progress');
  const assignedTrip = myDriving.find((t) => t.status === 'accepted');
  // Selected = agent picked you, you haven't accepted/declined yet (handshake spec).
  const awaitingDecision = (myApplicationsQuery.data ?? []).filter((a) => a.status === 'selected');

  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{getFirstName(driver.fullName) || user?.displayName || 'Driver'}</span>
            <Badge variant="success">Driver</Badge>
            {cities.length > 0 ? <NearCityPicker cities={cities} value={nearCityId} onChange={setNearCityId} /> : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Bellish count={unread} />
          <ProfileAvatar name={driver.fullName || user?.displayName || 'Driver'} photoUrl={driver.profilePhotoUrl} />
        </div>
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {driver.verification && <GetVerifiedBanner verification={driver.verification} />}

        {/* Priority stack — Driving now / Review / I'm vacant, with placement that follows
            which cards have live content. Empty state of every card is rendered always so
            the driver always sees the same shape. */}
        {(() => {
          const hasInProgress = !!inProgressTrip;
          const hasReview = awaitingDecision.length > 0;
          const driving = <CurrentTripCard key="driving" trip={inProgressTrip} />;
          const review = <AwaitingMyDecisionCard key="review" apps={awaitingDecision} />;
          const vacant = <IAmAvailableCard key="vacant" driverId={driver.id} />;
          // Rules:
          //   both empty           → vacant first (promotes the call to post availability)
          //   driving only         → vacant between (review still empty below)
          //   review active (any)  → vacant last
          let order: React.ReactNode[];
          if (!hasInProgress && !hasReview) order = [vacant, driving, review];
          else if (hasInProgress && !hasReview) order = [driving, vacant, review];
          else order = [driving, review, vacant];
          return <>{order}</>;
        })()}
        {pendingReceivedInvites.length > 0 ? <InvitesReceivedCard trips={pendingReceivedInvites} /> : null}
        {assignedTrip ? <AssignedTripCard trip={assignedTrip} /> : null}

        <ReputationCard driver={driver} />

        <Link to="/my-earnings" className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-emerald-50 to-emerald-100/40 px-4 py-3 transition-colors hover:border-primary/40">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <TrendingUp className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Your earnings</span>
            <span className="block text-xs text-secondary">Trips, payouts and monthly trend</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-secondary" aria-hidden />
        </Link>
      </div>

      <div className="px-4 pb-4">
        <InstallAppCard dismissable />
      </div>

      <div className="space-y-3 px-4">
        {postedWithApplicants > 0 ? (
          <ActionCard tone="amber" icon={<Sparkles className="size-5" aria-hidden />} title={`${postedWithApplicants} trip you posted ${postedWithApplicants > 1 ? 'have' : 'has'} applicants`} hint="Review applicants and pick a driver." to="/posted-trips" />
        ) : null}
        {hasPendingInvites ? <InvitesSentCard trips={myPosts} /> : null}
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
            <div className="text-xs text-secondary">Try another area, or tap “I&apos;m vacant” so agents can find you.</div>
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
/** Minimal scaffold shown while /drivers/me is in flight. Renders only the header
 *  chrome (Welcome back + greeting + role pill) so LCP fires on this small static
 *  block, not on the queries-dependent card stack below. The greeting falls back to
 *  the auth display name when the driver profile hasn't loaded yet. */
function HomeChromeFallback() {
  const { user } = useAuth();
  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{getFirstName(user?.displayName ?? '') || user?.displayName || 'Driver'}</span>
            <Badge variant="success">Driver</Badge>
          </div>
        </div>
      </header>
      <div className="space-y-3 px-4 pb-4 pt-3">
        <LoadingSkeleton rows={5} />
      </div>
    </div>
  );
}

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
    // Paint the page chrome immediately so LCP fires on the header text instead of
    // waiting for /drivers/me (~2.7s on mobile India). Greeting comes from AuthContext;
    // priority cards render as a single short skeleton below it.
    return (
      <main className="mx-auto max-w-md">
        <HomeChromeFallback />
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
