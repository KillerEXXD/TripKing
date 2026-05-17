import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, Clock, Navigation, Sparkles, Star, Users } from 'lucide-react';
import { PriorityCard } from '@/components/ui';
import { toast } from 'sonner';
import { NearCityPicker } from '@/components/location/NearCityPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useMyDriver } from '@/hooks/useDrivers';
import { useCompleteTrip, useMyApplications, useTrips } from '@/hooks/useTrips';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { cityHooks } from '@/hooks/useAdminConfig';
import { IAmAvailableCard } from '@/components/vacancy/IAmAvailableCard';
import { Button, Card } from '@/components/ui';
import { GetVerifiedBanner } from '@/components/driver';
import { InvitesSentCard } from '@/components/home/InvitesSentCard';
import { InvitesReceivedCard } from '@/components/home/InvitesReceivedCard';
import { HomeTileRow } from '@/components/home/HomeTileRow';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import { WalletPill } from '@/components/wallet/WalletPill';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR, formatPickupDateTime, getFirstName, initials } from '@/lib/utils';
import type { Driver, MyApplication, Trip } from '@/types';

function ProfileAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  return (
    <Link to="/profile" aria-label="Your profile" className="flex size-7 items-center justify-center overflow-hidden rounded-full border bg-primary/15 text-[11px] font-bold text-primary hover:ring-2 hover:ring-primary/40">
      {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : <span>{name ? initials(name) : '?'}</span>}
    </Link>
  );
}
function Bellish({ count }: { count: number }) {
  return (
    <Link to="/notifications" aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'} className="relative flex size-7 items-center justify-center rounded-full text-secondary hover:bg-muted">
      <Bell className="size-4" aria-hidden />
      {count > 0 ? <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-destructive" /> : null}
    </Link>
  );
}

function ReputationCard({ driver }: { driver: Driver }) {
  return (
    <PriorityCard
      to={`/drivers/${driver.id}`}
      tone="amber"
      icon={<Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden />}
      label="Your reputation"
      title={driver.ratingCount > 0 ? `★ ${driver.ratingAvg.toFixed(1)} · ${driver.ratingCount} ratings` : 'No ratings yet'}
      subtitle={`${driver.totalTripsCompleted} trips completed`}
      cta={{ label: 'View full profile' }}
    >
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-amber-200 bg-white/70 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">From passengers</div>
          <div className="truncate text-[10px] text-amber-800/80">{driver.topTags[0] ?? 'Complete trips to earn tags'}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white/70 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">From agents</div>
          <div className="truncate text-[10px] text-amber-800/80">{driver.managerTopTags[0] ?? 'Run agent trips to earn tags'}</div>
        </div>
      </div>
    </PriorityCard>
  );
}

/**
 * Top-of-home card for a trip the driver is actively running (`status='in_progress'`).
 * Surfaces route + distance + payout + pickup + passenger count inline, plus an End
 * trip shortcut so the driver can complete without drilling in. Caller gates on
 * `inProgressTrip` truthiness — card is hidden when there's no live trip.
 */
function CurrentTripCard({ trip }: { trip: Trip }) {
  const navigate = useNavigate();
  const completeMutation = useCompleteTrip();
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
    <PriorityCard
      onClick={() => navigate(`/trips/${trip.id}`)}
      ariaLabel={`Open trip ${trip.fromCity.name} to ${trip.toCity.name}`}
      tone="emerald"
      icon={<Navigation className="size-3.5" aria-hidden />}
      label="Driving now"
      title={`${trip.fromCity.name} → ${trip.toCity.name}`}
      subtitle={`${Math.round(trip.expectedDistanceKm)} km · ${formatINR(trip.driverPayout)} payout`}
      rightAction={
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="outline" className="bg-white" onClick={onEnd} disabled={completeMutation.isPending}>
            {completeMutation.isPending ? 'Ending…' : 'End trip'}
          </Button>
          <Button asChild size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800">
            <Link to={`/trips/${trip.id}`} onClick={(e) => e.stopPropagation()}>Continue</Link>
          </Button>
        </div>
      }
    >
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-emerald-200 pt-2.5 text-xs text-emerald-900">
        <CurrentTripStat icon={<Clock className="size-3.5" aria-hidden />} label="Pickup" value={formatPickupDateTime(trip.pickupAt)} />
        <CurrentTripStat icon={<Navigation className="size-3.5" aria-hidden />} label="To destination" value={trip.distanceToDestinationKm ? `${Math.round(trip.distanceToDestinationKm)} km` : '—'} />
        <CurrentTripStat icon={<Users className="size-3.5" aria-hidden />} label="Passenger" value={`${trip.passengerCount} pax`} />
      </div>
    </PriorityCard>
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
    <PriorityCard
      to={`/trips/${trip.id}`}
      tone="amber"
      icon={<CheckCircle2 className="size-3.5" aria-hidden />}
      label="Ready to start"
      title={`${trip.fromCity.name} → ${trip.toCity.name}`}
      subtitle={`Pickup: ${formatPickupDateTime(trip.pickupAt)} · ${Math.round(trip.expectedDistanceKm)} km`}
      cta={{ label: 'Start the trip' }}
    />
  );
}

/**
 * Trips an agent has selected the driver for, awaiting accept/decline. These live in
 * `trip_acceptances` with `status='selected'` — sourced from `useMyApplications` and
 * filtered client-side. (We could add `?status=selected` to the API later if list size
 * becomes a concern.)
 */
function AwaitingMyDecisionCard({ apps }: { apps: MyApplication[] }) {
  const first = apps[0]!;
  const more = apps.length - 1;
  // One trip → land directly on its detail so the driver can Accept / Decline in one tap.
  // Multiple → focused list at /my-trips/review with the rich applicant-style cards.
  const href = apps.length === 1 ? `/trips/${first.trip.id}` : '/my-trips/review';
  return (
    <PriorityCard
      to={href}
      linkState={{ from: 'home' }}
      tone="indigo"
      icon={<Sparkles className="size-3.5" aria-hidden />}
      label={`${apps.length} trip${apps.length === 1 ? '' : 's'} waiting for your decision`}
      title={`${first.trip.fromCity.name} → ${first.trip.toCity.name}`}
      subtitle={`Pickup: ${formatPickupDateTime(first.trip.pickupAt)}${more > 0 ? ` · +${more} more` : ''}`}
      cta={{ label: 'Review' }}
    />
  );
}

function DriverHome({ driver }: { driver: Driver }) {
  const { user } = useAuth();
  const unread = useUnreadNotificationCount();
  const cities = cityHooks.useList().data ?? [];
  const [nearCityId, setNearCityId] = useState<string>(driver.currentCity?.id ?? driver.homeCity?.id ?? '');

  // Auth fix from main (PR #195): gate the user-scoped query with enabled so
  // an in-flight poll doesn't fire against a freshly-nulled session.
  const myPostsQuery = useTrips(user ? { postedByUserId: user.id } : undefined, { enabled: !!user });
  const myDrivingQuery = useTrips({ assignedDriverId: 'me' });
  const myApplicationsQuery = useMyApplications();
  const invitedToDriveQuery = useTrips({ invited: 'me' });

  const myPosts = myPostsQuery.data ?? [];
  const postedWithApplicants = myPosts.filter((t) => t.status === 'has_applicants').length;
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
      <header className="sticky top-0 z-10 flex items-end justify-between gap-3 bg-surface px-4 py-3 shadow-header">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{getFirstName(driver.fullName) || user?.displayName || 'Driver'}</span>
            <span aria-label="Driver" title="Driver" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">D</span>
            {cities.length > 0 ? <NearCityPicker cities={cities} value={nearCityId} onChange={setNearCityId} /> : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <WalletPill />
          <Bellish count={unread} />
          <ProfileAvatar name={driver.fullName || user?.displayName || 'Driver'} photoUrl={driver.profilePhotoUrl} />
        </div>
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {driver.verification && <GetVerifiedBanner verification={driver.verification} />}

        {/* Priority stack — natural top-down priority: live trip → action needed → CTA.
            Driving now and Review are hidden when empty; I'm vacant always renders
            (it's the platform's primary call-to-action — drivers must post availability
            for the marketplace to work, and its own internal state handles the empty case).
            Trips-you-posted indicators (applicants-waiting + invites-sent) bubble up here
            BEFORE the reputation card — they're actionable; reputation is informational. */}
        {inProgressTrip ? <CurrentTripCard trip={inProgressTrip} /> : null}
        {awaitingDecision.length > 0 ? <AwaitingMyDecisionCard apps={awaitingDecision} /> : null}
        <IAmAvailableCard driverId={driver.id} />
        {pendingReceivedInvites.length > 0 ? <InvitesReceivedCard trips={pendingReceivedInvites} /> : null}
        {assignedTrip ? <AssignedTripCard trip={assignedTrip} /> : null}

        {postedWithApplicants > 0 ? (
          <PriorityCard
            to="/posted-trips"
            tone="amber"
            icon={<Sparkles className="size-3.5" aria-hidden />}
            label={`${postedWithApplicants > 1 ? 'Trips' : 'Trip'} you posted ${postedWithApplicants > 1 ? 'have' : 'has'} applicants`}
            title={`${postedWithApplicants} ${postedWithApplicants > 1 ? 'trips' : 'trip'} need a driver`}
            subtitle="Review applicants and pick a driver."
            cta={{ label: 'Review applicants' }}
          />
        ) : null}
        <InvitesSentCard trips={myPosts} />

        <ReputationCard driver={driver} />

        <HomeTileRow role="driver" />
      </div>

      <div className="px-4 pb-4">
        <InstallAppCard dismissable />
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
      <header className="sticky top-0 z-10 flex items-end justify-between gap-3 bg-surface px-4 py-3 shadow-header">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{getFirstName(user?.displayName ?? '') || user?.displayName || 'Driver'}</span>
            <span aria-label="Driver" title="Driver" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">D</span>
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
