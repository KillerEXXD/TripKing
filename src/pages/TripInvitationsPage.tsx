import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTrip, useTripInvites, useWithdrawTripInvite } from '@/hooks/useTrips';
import { Badge, Button, Card } from '@/components/ui';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR, formatKmAndDuration } from '@/lib/utils';
import type { TripInvitation, TripInvitationStatus } from '@/types';

const STATUS_BADGE: Record<TripInvitationStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' }> = {
  pending: { label: 'Awaiting driver', variant: 'info' },
  applied: { label: 'Applied back', variant: 'success' },
  declined: { label: 'Declined', variant: 'muted' },
  withdrawn: { label: 'Withdrawn', variant: 'muted' },
  expired: { label: 'Expired', variant: 'muted' },
};

function invitedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function InvitationCard({
  invite,
  tripId,
  canWithdraw,
  onWithdraw,
  withdrawing,
}: {
  invite: TripInvitation;
  tripId: string;
  canWithdraw: boolean;
  onWithdraw: () => void;
  withdrawing: boolean;
}) {
  const d = invite.driver;
  const meta = STATUS_BADGE[invite.status] ?? { label: String(invite.status), variant: 'muted' as const };
  const reciprocated = invite.status === 'applied';
  const heading = reciprocated && d?.fullName ? d.fullName : d?.displayHandle ? `Driver ${d.displayHandle}` : 'Driver';
  const dim = invite.status === 'declined' || invite.status === 'withdrawn' || invite.status === 'expired';
  return (
    <Card className={`gap-3 ${reciprocated ? 'border-emerald-300 bg-emerald-50/40' : dim ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{heading}</span>
            {d?.kycStatus === 'approved' ? <VerifiedBadge size="xs" tone="emerald" /> : null}
          </div>
          {reciprocated && d?.fullName && d.displayHandle ? (
            <div className="font-mono text-[11px] uppercase tracking-wide text-secondary">{d.displayHandle}</div>
          ) : null}
          <div className="mt-0.5 text-xs text-secondary">
            {d && d.ratingCount > 0 ? (
              <>
                <span className="font-semibold text-amber-600">★ {d.ratingAvg.toFixed(1)}</span> · {d.ratingCount} · {d.totalTripsCompleted} trips · invited {invitedAt(invite.createdAt)}
              </>
            ) : (
              <>{d?.totalTripsCompleted ?? 0} trips · invited {invitedAt(invite.createdAt)}</>
            )}
          </div>
        </div>
        <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
      </div>
      {invite.declinedReason ? (
        <p className="text-xs text-secondary">Reason: {invite.declinedReason}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t pt-2.5 text-xs">
        <Link to={`/drivers/${invite.driverId}`} className="flex items-center text-primary">
          View driver profile <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
        </Link>
        {canWithdraw && invite.status === 'pending' ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={withdrawing}
            aria-label="Withdraw invite"
            onClick={onWithdraw}
          >
            <X className="size-3.5" aria-hidden /> Withdraw
          </Button>
        ) : null}
        {reciprocated ? (
          <Link to={`/trips/${tripId}/applicants`} className="flex items-center text-emerald-700">
            Review application <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * `/trips/:id/invitations` — the poster's view of drivers they invited to a trip
 * and each invitation's status (pending / applied / declined / withdrawn / expired).
 * Driver identity stays anonymous (handle + trust signals only) until the driver
 * reciprocates by applying — backend enforces the reveal rule.
 */
export function TripInvitationsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // `?from=` overrides the default back target so the home-card → trip-invitations path
  // walks back to home, not to /posted-trips. Matches the pattern TripDetailPage uses.
  const backTarget = searchParams.get('from') ?? '/posted-trips';
  const { user } = useAuth();
  const tripQuery = useTrip(id);
  const trip = tripQuery.data;
  const isPoster = !!user && !!trip && user.id === trip.postedByUserId;
  const invitesQuery = useTripInvites(id, isPoster);
  const withdraw = useWithdrawTripInvite();
  const notFound = !id || (tripQuery.isError && tripQuery.error instanceof ApiError && tripQuery.error.status === 404);
  const canWithdraw = isPoster && !!trip && (trip.status === 'open' || trip.status === 'has_applicants');

  function onWithdraw(inviteId: string) {
    if (!id) return;
    withdraw.mutate(
      { tripId: id, inviteId },
      {
        onSuccess: () => toast.success('Invite withdrawn'),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't withdraw"),
      },
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-surface px-4 py-3 shadow-header">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(backTarget)}
          className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">Invitations sent</h1>
          {trip ? (
            <div className="truncate text-xs text-secondary">
              {trip.fromCity.name} → {trip.toCity.name} · {trip.pendingInvitationCount} pending
            </div>
          ) : null}
        </div>
      </header>

      <div className="space-y-3 p-4">
        {notFound ? (
          <ErrorState title="Trip not found" message="This trip may have been removed." />
        ) : tripQuery.isPending ? (
          <LoadingSkeleton rows={5} />
        ) : tripQuery.isError ? (
          <ErrorState title="Couldn't load this trip" message="Check your connection and try again." onRetry={() => void tripQuery.refetch()} />
        ) : !isPoster ? (
          <Card><p className="text-sm text-secondary">Only the trip poster can see the invitations sent for this trip.</p></Card>
        ) : (
          <>
            <Card className="gap-1">
              <div className="font-bold">{trip.fromCity.name} → {trip.toCity.name}</div>
              <div className="text-xs text-secondary">
                {formatKmAndDuration(trip.expectedDistanceKm)} · {formatINR(trip.ratePerKm)}/km · {formatINR(trip.totalFare)} fare · {formatINR(trip.driverPayout)} driver payout
              </div>
            </Card>
            {invitesQuery.isPending ? (
              <LoadingSkeleton rows={3} />
            ) : invitesQuery.isError ? (
              <ErrorState
                title="Couldn't load invitations"
                message="Check your connection and try again."
                onRetry={() => void invitesQuery.refetch()}
              />
            ) : (() => {
              // Hide system-withdrawn rows (migration 041 flips siblings to 'withdrawn'
              // when the agent assigns a driver) — they're stale and not actionable.
              const items = (invitesQuery.data ?? []).filter((i) => i.status !== 'withdrawn');
              const assigned = trip.status !== 'open' && trip.status !== 'has_applicants';
              if (items.length === 0) {
                return assigned ? (
                  <EmptyState
                    title="No active invitations"
                    message="All earlier invitations were withdrawn when you assigned a driver."
                  />
                ) : (
                  <EmptyState
                    title="No invitations sent for this trip yet"
                    message="Open the trip and invite specific KYC-approved drivers in the pickup city."
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/trips/${id}`}>Open trip</Link>
                      </Button>
                    }
                  />
                );
              }
              return items.map((inv) => (
                <InvitationCard
                  key={inv.id}
                  invite={inv}
                  tripId={id ?? ''}
                  canWithdraw={canWithdraw}
                  withdrawing={withdraw.isPending}
                  onWithdraw={() => onWithdraw(inv.id)}
                />
              ));
            })()}
          </>
        )}
      </div>
    </div>
  );
}

export default TripInvitationsPage;
