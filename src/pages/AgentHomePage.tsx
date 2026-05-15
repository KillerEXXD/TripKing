import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, ChevronRight, Navigation, Sparkles, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAgent } from '@/hooks/useDrivers';
import { useTrips } from '@/hooks/useTrips';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { Badge, Button, Card } from '@/components/ui';
import { AGENT_VERIFICATION_STEPS, GetVerifiedBanner } from '@/components/driver';
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
 *  running. Always rendered: when count is 0, an empty-state card explains what
 *  will appear here. Click (when active) → /posted-trips?status=in_progress. */
function TripsInProgressCard({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <Navigation className="size-3.5" aria-hidden /> Driving now
        </div>
        <div className="mt-1 text-sm font-medium text-slate-700">No trips in progress</div>
        <div className="mt-0.5 text-xs text-slate-500">
          When your trips are being driven, they'll show up here with the driver, passenger, and live ETA.
        </div>
      </div>
    );
  }
  return (
    <Link
      to="/posted-trips?status=in_progress"
      className="block rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        <Navigation className="size-3.5" aria-hidden /> Driving now
      </div>
      <div className="mt-1 text-lg font-bold text-emerald-950">
        {count} trip{count === 1 ? '' : 's'} in progress
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

/** Trips the agent posted that have applicants but no driver selected yet.
 *  Always rendered: when tripCount is 0, an empty-state card explains what
 *  will appear here. Click (when active) → /posted-trips?status=has_applicants. */
function NeedsActionCard({ tripCount, totalApplicants }: { tripCount: number; totalApplicants: number }) {
  if (tripCount === 0) {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <Sparkles className="size-3.5" aria-hidden /> Review
        </div>
        <div className="mt-1 text-sm font-medium text-slate-700">No applicants waiting</div>
        <div className="mt-0.5 text-xs text-slate-500">
          When drivers apply to your trips, they'll show up here so you can pick one.
        </div>
      </div>
    );
  }
  return (
    <Link
      to="/posted-trips?status=has_applicants"
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
  const inProgressCount = myPosts.filter((t) => t.status === 'in_progress').length;
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

        {/* Priority stack — surfaces in-flight work and decisions awaiting the agent.
            Each card no-ops when its count is zero. Mirrors the Driver-home pattern (PR #66). */}
        <TripsInProgressCard count={inProgressCount} />
        <NeedsActionCard tripCount={needsActionTrips.length} totalApplicants={needsActionApplicants} />

        <Link to="/profile" className="block w-full space-y-2 rounded-xl border bg-white px-3 py-2.5 transition-colors hover:border-primary/40">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-secondary">Your reputation</div>
          <div className="flex items-center gap-1 text-sm font-bold">
            <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden /> {agent.totalTripsPosted} trips posted
          </div>
          <div className="truncate text-[10px] text-secondary">{agent.topTags[0] ?? 'Run trips smoothly to earn driver tags'}</div>
          <div className="flex items-center gap-1 text-[10px] text-secondary">
            <ChevronRight className="size-3" aria-hidden /> View / edit your profile
          </div>
        </Link>

        <Link to="/analytics" className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-blue-50 to-blue-100/40 px-4 py-3 transition-colors hover:border-primary/40">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <BarChart3 className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Your analytics</span>
            <span className="block text-xs text-secondary">Trips posted, applicants, fares</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-secondary" aria-hidden />
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
