import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, ChevronRight, Clock, Navigation, Plus, Sparkles, Star, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAgent } from '@/hooks/useDrivers';
import { useTrips } from '@/hooks/useTrips';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { Badge, Button, Card } from '@/components/ui';
import { AGENT_VERIFICATION_STEPS, GetVerifiedBanner } from '@/components/driver';
import { InvitesSentCard } from '@/components/home/InvitesSentCard';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR, formatPickupTime, getFirstName, initials } from '@/lib/utils';
import type { Agent, Trip } from '@/types';

const STATUS_LABEL: Record<Trip['status'], string> = { open: 'Open', has_applicants: 'Has applicants', selected: 'Awaiting acceptance', accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

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
/** Top-of-home card — shows the agent how many of their posted trips are actively
 *  running. Caller gates on `trips.length > 0` so the empty placeholder is hidden
 *  (an agent already knows whether their trips are in flight — empty teaches nothing).
 *  1 → straight to that trip's detail. ≥2 → focused work-queue at `/queue/in-progress`. */
function TripsInProgressCard({ trips }: { trips: Trip[] }) {
  const count = trips.length;
  if (count === 1) {
    const t = trips[0];
    const driverName = t.assignedDriver?.fullName ?? (t.assignedDriverHandle ? `Driver ${t.assignedDriverHandle}` : 'Driver');
    return (
      <Link
        to={`/trips/${t.id}`}
        aria-label={`Open trip ${t.fromCity.name} to ${t.toCity.name}`}
        className="block rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100"
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
          <Navigation className="size-3.5" aria-hidden /> Driving now
        </div>
        <div className="mt-1 text-lg font-bold text-emerald-950">
          {t.fromCity.name} → {t.toCity.name}
        </div>
        <div className="mt-0.5 text-xs text-emerald-800">
          {Math.round(t.expectedDistanceKm)} km · {formatINR(t.driverPayout)} payout · {driverName}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-emerald-200 pt-2.5 text-xs text-emerald-900">
          <TripStat icon={<Clock className="size-3.5" aria-hidden />} label="Pickup" value={formatPickupTime(t.pickupAt)} />
          <TripStat icon={<Navigation className="size-3.5" aria-hidden />} label="To destination" value={t.distanceToDestinationKm ? `${Math.round(t.distanceToDestinationKm)} km` : '—'} />
          <TripStat icon={<Users className="size-3.5" aria-hidden />} label="Passenger" value={`${t.passengerCount} pax`} />
        </div>
      </Link>
    );
  }
  return (
    <Link
      to="/queue/in-progress"
      className="block rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        <Navigation className="size-3.5" aria-hidden /> Driving now
      </div>
      <div className="mt-1 text-lg font-bold text-emerald-950">
        {count} trips in progress
      </div>
      <div className="mt-0.5 text-xs text-emerald-800">
        Tap to see drivers, passengers, and ETA for each.
      </div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white">
        View all <ChevronRight className="size-4" aria-hidden />
      </div>
    </Link>
  );
}

function TripStat({ icon, label, value, tone = 'emerald' }: { icon: React.ReactNode; label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const labelTone = tone === 'amber' ? 'text-amber-700/80' : 'text-emerald-700/80';
  const iconTone = tone === 'amber' ? 'text-amber-700' : 'text-emerald-700';
  return (
    <div className="flex items-start gap-1.5">
      <span className={`mt-0.5 ${iconTone}`} aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className={`text-[10px] uppercase tracking-wide ${labelTone}`}>{label}</div>
        <div className="truncate font-semibold">{value}</div>
      </div>
    </div>
  );
}

/** Trips the agent posted that have applicants but no driver selected yet. Caller
 *  gates on `trips.length > 0` so the empty placeholder is hidden (the notification
 *  bell + `Has applicants` badge on /posted-trips already surface this — empty is
 *  noise). 1 → straight to that trip's applicants. ≥2 → focused work-queue. */
function NeedsActionCard({ trips, totalApplicants }: { trips: Trip[]; totalApplicants: number }) {
  const tripCount = trips.length;
  if (tripCount === 1) {
    const t = trips[0];
    return (
      <Link
        to={`/trips/${t.id}/applicants`}
        aria-label={`Review applicants for ${t.fromCity.name} to ${t.toCity.name}`}
        className="block rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">
          <Sparkles className="size-3.5" aria-hidden /> Waiting for your decision
        </div>
        <div className="mt-1 text-lg font-bold text-amber-950">
          {t.fromCity.name} → {t.toCity.name}
        </div>
        <div className="mt-0.5 text-xs text-amber-800">
          {t.applicantCount} driver{t.applicantCount === 1 ? '' : 's'} applied · pick one
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-amber-200 pt-2.5 text-xs text-amber-900">
          <TripStat tone="amber" icon={<Clock className="size-3.5" aria-hidden />} label="Pickup" value={formatPickupTime(t.pickupAt)} />
          <TripStat tone="amber" icon={<Wallet className="size-3.5" aria-hidden />} label="Payout" value={formatINR(t.driverPayout)} />
          <TripStat tone="amber" icon={<Users className="size-3.5" aria-hidden />} label="Passenger" value={`${t.passengerCount} pax`} />
        </div>
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-700 px-4 py-1.5 text-sm font-semibold text-white">
          Review applicants <ChevronRight className="size-4" aria-hidden />
        </div>
      </Link>
    );
  }
  return (
    <Link
      to="/queue/needs-action"
      className="block rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">
        <Sparkles className="size-3.5" aria-hidden /> Waiting for your decision
      </div>
      <div className="mt-1 text-lg font-bold text-amber-950">
        {tripCount} trip{tripCount === 1 ? '' : 's'} need a driver
      </div>
      <div className="mt-0.5 text-xs text-amber-800">
        {totalApplicants} driver{totalApplicants === 1 ? '' : 's'} applied across {tripCount === 1 ? 'this trip' : 'these trips'}. Pick one.
      </div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-700 px-4 py-1.5 text-sm font-semibold text-white">
        Review <ChevronRight className="size-4" aria-hidden />
      </div>
    </Link>
  );
}

function PostedTripRow({ trip }: { trip: Trip }) {
  return (
    <Link to={trip.status === 'has_applicants' ? `/trips/${trip.id}/applicants` : `/trips/${trip.id}`} className="block">
      <Card className="gap-1.5 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">{trip.fromCity.name} → {trip.toCity.name}</div>
            <div className="text-xs text-secondary">{formatPickupTime(trip.pickupAt)} · {formatINR(trip.driverPayout)} payout</div>
          </div>
          <Badge variant={trip.status === 'has_applicants' ? 'warning' : trip.status === 'accepted' || trip.status === 'in_progress' ? 'info' : trip.status === 'completed' ? 'muted' : trip.status === 'cancelled' ? 'destructive' : 'success'}>{STATUS_LABEL[trip.status]}</Badge>
        </div>
        {trip.applicantCount > 0 ? (
          <div className="flex items-center gap-1 text-xs text-amber-700">
            <Sparkles className="size-3" aria-hidden /> {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
function AgentHome({ agent }: { agent: Agent }) {
  const { user } = useAuth();
  const unread = useUnreadNotificationCount();
  const myPostsQuery = useTrips(user ? { postedByUserId: user.id } : undefined);

  const myPosts = myPostsQuery.data ?? [];
  const inProgressTrips = myPosts.filter((t) => t.status === 'in_progress');
  const needsActionTrips = myPosts.filter((t) => t.status === 'has_applicants');
  const needsActionApplicants = needsActionTrips.reduce((sum, t) => sum + (t.applicantCount ?? 0), 0);

  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{getFirstName(agent.fullName) || user?.displayName || 'Agent'}</span>
            <Badge variant="secondary">Agent</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Bellish count={unread} />
          <ProfileAvatar name={agent.fullName || user?.displayName || 'Agent'} photoUrl={agent.profilePhotoUrl} />
        </div>
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {agent.verification && agent.kycStatus !== 'approved' ? <GetVerifiedBanner verification={agent.verification} steps={AGENT_VERIFICATION_STEPS} /> : null}

        {/* Priority stack — natural top-down priority: live trips → decisions needed → invites
            outstanding → CTA. The first three cards are hidden when empty (an agent already
            knows whether they have work — placeholders are noise). "Post a trip" is the
            always-visible CTA — the agent's equivalent of the driver's "I'm vacant". */}
        {inProgressTrips.length > 0 ? <TripsInProgressCard trips={inProgressTrips} /> : null}
        {needsActionTrips.length > 0 ? <NeedsActionCard trips={needsActionTrips} totalApplicants={needsActionApplicants} /> : null}
        <InvitesSentCard trips={myPosts} />

        <Link to="/trips/new" className="block rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
            <Plus className="size-3.5" aria-hidden /> Post a trip
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-950">
            Get a trip on the marketplace
          </div>
          <div className="mt-0.5 text-xs text-emerald-800">
            Drivers see it in seconds. Pick the one you like best.
          </div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white">
            Post a trip <ChevronRight className="size-4" aria-hidden />
          </div>
        </Link>

        <Link to="/profile" className="block w-full space-y-2 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">
            <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden /> Your reputation
          </div>
          <div className="mt-1 text-lg font-bold text-amber-950">
            {agent.totalTripsPosted} trips posted
          </div>
          <div className="mt-0.5 text-xs text-amber-800">
            {agent.topTags[0] ?? 'Run trips smoothly to earn driver tags'}
          </div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-700 px-4 py-1.5 text-sm font-semibold text-white">
            View / edit profile <ChevronRight className="size-4" aria-hidden />
          </div>
        </Link>

        <Link to="/analytics" className="block rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 transition-colors hover:bg-blue-100">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-blue-700">
            <BarChart3 className="size-3.5" aria-hidden /> Your analytics
          </div>
          <div className="mt-1 text-lg font-bold text-blue-950">
            Trips posted, applicants, fares
          </div>
          <div className="mt-0.5 text-xs text-blue-800">
            See how your trips are performing month over month.
          </div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white">
            View analytics <ChevronRight className="size-4" aria-hidden />
          </div>
        </Link>
      </div>

      <div className="px-4 pb-4">
        <InstallAppCard dismissable />
      </div>

      <div className="space-y-3 px-4">
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">Your recent trips</h2>
            {myPostsQuery.isSuccess ? <Badge variant="muted">{myPosts.length}</Badge> : null}
          </div>
          {myPostsQuery.isPending ? (
            <LoadingSkeleton rows={2} />
          ) : myPostsQuery.isError ? (
            <ErrorState title="Couldn't load your trips" message="Check your connection and try again." onRetry={() => void myPostsQuery.refetch()} />
          ) : myPosts.length === 0 ? (
            <Card className="items-center text-center">
              <div className="text-sm font-medium">You haven't posted a trip yet</div>
              <Button asChild variant="full" size="sm">
                <Link to="/trips/new">Post your first trip</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {myPosts.slice(0, 3).map((t) => (
                <PostedTripRow key={t.id} trip={t} />
              ))}
              <Button asChild variant="outline" className="w-full">
                <Link to="/posted-trips">All your posts →</Link>
              </Button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/** Lightweight scaffold rendered while `/agents/me` is in-flight. Mirrors
 *  HomeChromeFallback on the driver side — gives LCP something fast to paint. */
function AgentHomeChromeFallback() {
  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="text-base font-semibold">Loading your home…</div>
        </div>
      </header>
      <div className="space-y-3 px-4 pt-3">
        <LoadingSkeleton rows={3} />
      </div>
    </div>
  );
}

/** `/` for an agent — post-and-shepherd home: actions, reputation, posts with applicants, recent posts. Built on `useMyAgent` / `useTrips` / `useNotifications`. */
export function AgentHomePage() {
  const navigate = useNavigate();
  const agentQuery = useMyAgent(true);
  const noProfile = agentQuery.isError && agentQuery.error instanceof ApiError && agentQuery.error.status === 404;

  if (noProfile) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <Card className="gap-2">
          <h1 className="text-lg font-bold">Finish setting up your agent profile</h1>
          <p className="text-sm text-secondary">You're signed in, but you don't have an agent profile yet.</p>
          <Button variant="full" size="sm" className="w-fit" onClick={() => navigate('/onboarding')}>
            Set up my profile
          </Button>
        </Card>
      </main>
    );
  }
  if (agentQuery.isPending) {
    // Paint the header chrome immediately so LCP fires on the greeting text instead
    // of waiting for /agents/me (~2.7s on mobile India). The header label/role pill
    // are static; the rest of the home stack renders as a short skeleton below.
    return (
      <main className="mx-auto max-w-md">
        <AgentHomeChromeFallback />
      </main>
    );
  }
  if (agentQuery.isError) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <ErrorState title="Couldn't load your home" message="Check your connection and try again." onRetry={() => void agentQuery.refetch()} />
      </main>
    );
  }
  return <AgentHome agent={agentQuery.data} />;
}

export default AgentHomePage;
