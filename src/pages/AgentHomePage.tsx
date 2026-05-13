import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Plus, Sparkles, Star, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAgent } from '@/hooks/useDrivers';
import { useTrips } from '@/hooks/useTrips';
import { useVacancies } from '@/hooks/useVacancies';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { Badge, Button, Card } from '@/components/ui';
import { AGENT_VERIFICATION_STEPS, GetVerifiedBanner } from '@/components/driver';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR } from '@/lib/utils';
import type { Agent, Trip, Vacancy } from '@/types';

const STATUS_LABEL: Record<Trip['status'], string> = { open: 'Open', has_applicants: 'Has applicants', assigned: 'Assigned', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
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
function HubTile({ icon, label, tone, to }: { icon: React.ReactNode; label: string; tone: 'violet' | 'blue' | 'emerald'; to: string }) {
  const palette = { violet: 'bg-violet-100 text-violet-700', blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700' };
  return (
    <Link to={to} className="flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-white p-3 text-center transition-colors hover:border-primary/40">
      <span className={`flex size-9 items-center justify-center rounded-full ${palette[tone]}`}>{icon}</span>
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
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
            <div className="text-xs text-secondary">{pickupLabel(trip.pickupAt)} · {formatINR(trip.driverPayout)} payout</div>
          </div>
          <Badge variant={trip.status === 'has_applicants' ? 'warning' : trip.status === 'assigned' || trip.status === 'in_progress' ? 'info' : trip.status === 'completed' ? 'muted' : trip.status === 'cancelled' ? 'destructive' : 'success'}>{STATUS_LABEL[trip.status]}</Badge>
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
function AvailableDriverRow({ v }: { v: Vacancy }) {
  return (
    <Link to={`/drivers/${v.driverId}`} className="block">
      <Card className="gap-1 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">{v.driver?.fullName || 'A driver'}</div>
            <div className="text-xs text-secondary">In {v.currentCity.name} · will drive to {v.destinationCities.map((c) => c.name).join(', ') || 'anywhere'}</div>
          </div>
          {v.driver && v.driver.ratingCount > 0 ? (
            <span className="shrink-0 text-xs font-semibold text-amber-600">★ {v.driver.ratingAvg.toFixed(1)}</span>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function AgentHome({ agent }: { agent: Agent }) {
  const { user } = useAuth();
  const unread = useUnreadNotificationCount();
  const myPostsQuery = useTrips(user ? { postedByUserId: user.id } : undefined);
  const driversQuery = useVacancies({ status: 'active' });

  const myPosts = myPostsQuery.data ?? [];
  const postedWithApplicants = myPosts.filter((t) => t.status === 'has_applicants').length;
  const available = driversQuery.data ?? [];

  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{user?.displayName || 'Agent'}</span>
            <Badge variant="secondary">Agent</Badge>
          </div>
        </div>
        <Bellish count={unread} />
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {agent.verification && agent.kycStatus !== 'approved' ? <GetVerifiedBanner verification={agent.verification} steps={AGENT_VERIFICATION_STEPS} /> : null}
        <div className="grid grid-cols-3 gap-2.5">
          <HubTile icon={<Plus className="size-5" aria-hidden />} label="Post a trip" tone="violet" to="/trips/new" />
          <HubTile icon={<Sparkles className="size-5" aria-hidden />} label="My posts" tone="blue" to="/posted-trips" />
          <HubTile icon={<Users className="size-5" aria-hidden />} label="Find a driver" tone="emerald" to="/vacancies" />
        </div>

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

        <Link to="/analytics" className="flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40">
          <span>Your analytics</span>
          <ChevronRight className="size-4 shrink-0 text-secondary" aria-hidden />
        </Link>
      </div>

      <div className="px-4 pb-4">
        <InstallAppCard dismissable />
      </div>

      <div className="space-y-3 px-4">
        {postedWithApplicants > 0 ? (
          <Link to="/posted-trips" className="block rounded-2xl border border-amber-200 bg-amber-50/50 p-4 transition-colors hover:brightness-[0.98]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Sparkles className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{postedWithApplicants} of your trips {postedWithApplicants > 1 ? 'have' : 'has'} applicants</div>
                <div className="truncate text-xs text-secondary">Review applicants and assign a driver.</div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-secondary" aria-hidden />
            </div>
          </Link>
        ) : null}

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

        {available.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Available drivers</h2>
              <Badge variant="muted">{available.length}</Badge>
            </div>
            <div className="space-y-2">
              {available.slice(0, 3).map((v) => (
                <AvailableDriverRow key={v.id} v={v} />
              ))}
              <Button asChild variant="outline" className="w-full">
                <Link to="/vacancies">Browse available drivers →</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** `/` for an agent — post-and-shepherd home: actions, reputation, posts with applicants, your recent posts, available drivers. Built on `useMyAgent` / `useTrips` / `useVacancies` / `useNotifications`. */
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
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <LoadingSkeleton rows={7} />
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
