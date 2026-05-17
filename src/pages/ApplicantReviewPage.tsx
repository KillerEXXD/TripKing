import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Car, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAssignDriver, useRejectApplicant, useTrip, useTripApplicants } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { PassengerLinkModal } from '@/components/share/PassengerLinkModal';
import { Avatar, AvatarFallback, Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { useDismissedRowsStore } from '@/stores/dismissedRowsStore';
import { formatINR, formatKmAndDuration, formatPickupDateTime, initials } from '@/lib/utils';
import type { AcceptanceStatus, Trip, TripAcceptance } from '@/types';

/** Terminal "negative" applicant states — soft-red row + Remove action. */
const NEGATIVE_ACCEPTANCE: ReadonlySet<AcceptanceStatus> = new Set(['rejected', 'withdrawn', 'expired']);

const STATUS_BADGE: Record<AcceptanceStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  applied: { label: 'Applied', variant: 'warning' },
  selected: { label: 'Selected', variant: 'info' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'muted' },
  withdrawn: { label: 'Withdrawn', variant: 'muted' },
  expired: { label: 'Expired', variant: 'muted' },
};

function appliedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function vehicleLabel(a: TripAcceptance): string | null {
  if (!a.vehicle) return null;
  const name = [a.vehicle.makeLabel, a.vehicle.modelName].filter(Boolean).join(' ');
  return [name || null, a.vehicle.carTypeLabel ?? null, `${a.vehicle.seats} seats`, a.vehicle.ac ? 'AC' : 'Non-AC'].filter(Boolean).join(' · ');
}

function ApplicantCard({
  acceptance,
  canAct,
  onAssign,
  onReject,
  assigning,
  rejecting,
}: {
  acceptance: TripAcceptance;
  canAct: boolean;
  onAssign: () => void;
  onReject: () => void;
  assigning: boolean;
  rejecting: boolean;
}) {
  const d = acceptance.driver;
  const veh = vehicleLabel(acceptance);
  const meta = STATUS_BADGE[acceptance.status] ?? { label: String(acceptance.status), variant: 'muted' as const };
  const isNegative = NEGATIVE_ACCEPTANCE.has(acceptance.status);
  const dismiss = useDismissedRowsStore((s) => s.dismiss);
  return (
    <Card className={`gap-3 ${acceptance.status === 'accepted' || acceptance.status === 'selected' ? 'border-emerald-300 bg-emerald-50/40' : isNegative ? 'border-red-200 bg-red-50/70' : ''}`}>
      <div className="flex items-start gap-3">
        <Link to={`/drivers/${acceptance.driverId}`} aria-label={`${d?.fullName || 'driver'} profile`}>
          <Avatar className="size-11">
            <AvatarFallback>{initials(d?.fullName || '?')}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/drivers/${acceptance.driverId}`} className="font-bold underline-offset-2 hover:underline">
            {d?.fullName || 'A driver'}
          </Link>
          {d ? (
            <div className="text-xs text-secondary">
              {d.ratingCount > 0 || d.totalTripsCompleted > 0 ? (
                <>
                  {d.totalTripsCompleted} trip{d.totalTripsCompleted === 1 ? '' : 's'}
                  {d.ratingCount > 0 ? (
                    <>
                      {' · '}
                      <span className="font-semibold text-amber-600">★ {d.ratingAvg.toFixed(1)}</span> ({d.ratingCount} review{d.ratingCount === 1 ? '' : 's'})
                    </>
                  ) : null}
                </>
              ) : (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">New driver</span>
              )}
            </div>
          ) : null}
          <div className="text-xs text-secondary">applied {appliedAt(acceptance.appliedAt)}</div>
        </div>
        <Badge variant={meta.variant} className="shrink-0">
          {acceptance.status === 'accepted' || acceptance.status === 'selected' ? <CheckCircle2 className="size-3" aria-hidden /> : null} {meta.label}
        </Badge>
        {isNegative ? (
          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0 shrink-0 text-red-700 hover:bg-red-100 hover:text-red-800"
            aria-label="Remove from list"
            onClick={() => dismiss(acceptance.id)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {d && d.topTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {d.topTags.map((t) => (
            <Badge key={t} variant="success">
              ★ {t}
            </Badge>
          ))}
        </div>
      ) : null}
      {veh ? (
        <div className="flex items-center gap-2 text-xs text-secondary">
          <Car className="size-3.5" aria-hidden /> {veh}
        </div>
      ) : null}
      {acceptance.applicantQuotedRatePerKm ? <div className="text-sm">Counter-quote: <span className="font-semibold">{formatINR(acceptance.applicantQuotedRatePerKm)}/km</span></div> : null}
      {acceptance.applicantMessage ? <p className="text-sm text-secondary">“{acceptance.applicantMessage}”</p> : null}
      {acceptance.decisionNote ? <p className="text-xs text-secondary">Note: {acceptance.decisionNote}</p> : null}
      {canAct && acceptance.status === 'applied' ? (
        <div className="flex gap-2">
          <Button className="flex-1 bg-black text-white hover:bg-black/90" size="sm" onClick={onAssign} disabled={assigning || rejecting}>
            {assigning ? 'Selecting…' : 'Select this driver'}
          </Button>
          <Button variant="outline" size="sm" onClick={onReject} disabled={assigning || rejecting}>
            {rejecting ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
      ) : canAct && acceptance.status === 'rejected' ? (
        // Agents change their mind — backend /assign doesn't filter by acceptance status, so a
        // rejected applicant can be reinstated by selecting them directly. No unreject step needed.
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onAssign} disabled={assigning || rejecting}>
            {assigning ? 'Selecting…' : 'Reconsider — select this driver'}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function TripSummaryCard({ trip, isPoster }: { trip: Trip; isPoster: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `trip-summary-${trip.id}`;
  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded ? 'true' : 'false'}
        aria-controls={panelId}
        className="flex w-full items-start gap-2 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            {trip.fromCity.name} → {trip.toCity.name}
          </div>
          <div className="text-xs text-secondary">
            {formatKmAndDuration(trip.expectedDistanceKm)} · {formatINR(trip.ratePerKm)}/km · {formatINR(trip.totalFare)} fare · {formatINR(trip.driverPayout)} driver payout
          </div>
        </div>
        <ChevronDown
          className={`mt-0.5 size-4 shrink-0 text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div id={panelId} className="space-y-1.5 border-t px-4 py-3 text-xs text-secondary">
          <div><span className="font-semibold text-foreground">Pickup:</span> {formatPickupDateTime(trip.pickupAt)}</div>
          <div>
            <span className="font-semibold text-foreground">Vehicle:</span>{' '}
            {[trip.carTypeLabel, `${trip.seatsRequired} seats`, trip.acRequired ? 'AC' : 'Non-AC'].filter(Boolean).join(' · ')}
          </div>
          <div>
            <span className="font-semibold text-foreground">Driver bata:</span> {formatINR(trip.driverBata)}
            {' · '}
            <span className="font-semibold text-foreground">GST:</span> {formatINR(trip.gstAmount)}
            {' · '}
            <span className="font-semibold text-foreground">Commission:</span> {trip.commissionPct}%
          </div>
          <div>
            <span className="font-semibold text-foreground">Extras:</span> paid by {trip.extrasPaidByPassenger ? 'passenger' : 'driver'}
          </div>
          {isPoster && trip.passengerName ? (
            <div>
              <span className="font-semibold text-foreground">Passenger:</span> {trip.passengerName}
              {trip.passengerPhone ? ` · ${trip.passengerPhone}` : ''} · {trip.passengerCount} pax
            </div>
          ) : null}
          {trip.luggageNotes ? <div><span className="font-semibold text-foreground">Luggage:</span> {trip.luggageNotes}</div> : null}
          {trip.specialRequests ? <div><span className="font-semibold text-foreground">Special requests:</span> {trip.specialRequests}</div> : null}
          {trip.driverInstructions ? (
            <div className="whitespace-pre-wrap"><span className="font-semibold text-foreground">Instructions:</span> {trip.driverInstructions}</div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Applicants({ trip, isPoster, from }: { trip: Trip; isPoster: boolean; from: string | null }) {
  // The route auth is enforced server-side; gate the client query on isPoster so
  // a non-poster who lands here (deep link / stale tab) doesn't fire a guaranteed 403.
  const applicantsQuery = useTripApplicants(trip.id, isPoster);
  const assign = useAssignDriver();
  const reject = useRejectApplicant();
  const navigate = useNavigate();
  const assignable = trip.status === 'open' || trip.status === 'has_applicants';
  const canAct = isPoster && assignable;
  const dismissed = useDismissedRowsStore((s) => s.ids);
  const applicants = (applicantsQuery.data ?? []).filter((a) => !dismissed[a.id]);
  const [assignedTrip, setAssignedTrip] = useState<Trip | null>(null);

  function onAssign(acceptanceId: string) {
    assign.mutate(
      { tripId: trip.id, acceptanceId },
      {
        onSuccess: (updated) => {
          if (!updated.passengerName) {
            // No passenger details yet — go to the trip and prompt the agent to fill them in.
            // Forward `?from=` so the fill flow can return the agent to their queue.
            toast.success('Driver selected — add the passenger details to complete the booking.');
            const fwd = from ? `&from=${encodeURIComponent(from)}` : '';
            navigate(`/trips/${trip.id}?fillPassenger=1${fwd}`);
          } else {
            toast.success(from ? 'Driver selected — back to your queue.' : 'Driver selected — share the trip link with the passenger.');
            if (updated.passengerOtp) {
              // Show the OTP modal; closing it (or having no OTP at all) returns to the queue.
              setAssignedTrip(updated);
            } else if (from) {
              navigate(from);
            }
          }
        },
        onError: () => toast.error("Couldn't select that driver — try again."),
      },
    );
  }
  function onReject(acceptanceId: string) {
    reject.mutate({ tripId: trip.id, acceptanceId }, { onError: () => toast.error("Couldn't reject that applicant — try again.") });
  }

  // Non-posters can't see the applicants list — the API would 403. Show a friendly
  // explainer instead of firing a guaranteed-to-fail request.
  if (!isPoster) {
    return <Card><p className="text-sm text-secondary">Only the trip poster can see who applied. Go back to the trip if you want to apply yourself.</p></Card>;
  }
  if (applicantsQuery.isPending) return <LoadingSkeleton rows={3} />;
  if (applicantsQuery.isError) return <ErrorState title="Couldn't load the applicants" message="Check your connection and try again." onRetry={() => void applicantsQuery.refetch()} />;
  if (applicants.length === 0) return <Card><p className="text-sm text-secondary">No one has applied to this trip yet.</p></Card>;

  return (
    <div className="space-y-3">
      {applicants.map((a) => (
        <ApplicantCard
          key={a.id}
          acceptance={a}
          canAct={canAct}
          assigning={assign.isPending}
          rejecting={reject.isPending}
          onAssign={() => onAssign(a.id)}
          onReject={() => onReject(a.id)}
        />
      ))}
      {assignedTrip && assignedTrip.passengerOtp ? (
        <PassengerLinkModal
          trip={assignedTrip}
          otp={assignedTrip.passengerOtp}
          onClose={() => {
            setAssignedTrip(null);
            if (from) navigate(from);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * `/trips/:id/applicants` — the poster's view of who applied to a trip, with
 * Select (= assign the driver, which generates the passenger OTP) and Reject.
 * Read via `useTripApplicants`; actions via `useAssignDriver` / `useRejectApplicant`.
 * Non-posters see the list read-only.
 */
export function ApplicantReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // `?from=<path>` — set when the agent entered from a Home-tab work queue
  // (e.g. `/queue/needs-action`). Used to override the back button + post-
  // assignment navigation so the agent returns to the queue, not the
  // generic /posted-trips hub.
  const from = params.get('from');
  const backTo = from || '/posted-trips';
  const { user } = useAuth();
  const tripQuery = useTrip(id);
  const notFound = !id || (tripQuery.isError && tripQuery.error instanceof ApiError && tripQuery.error.status === 404);
  const trip = tripQuery.data;

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-surface px-4 py-3 shadow-header">
        <button type="button" aria-label={from ? 'Back to your queue' : 'Back to your posted trips'} onClick={() => navigate(backTo)} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">Applicants</h1>
          {trip ? (
            <div className="truncate text-xs text-secondary">
              {trip.fromCity.name} → {trip.toCity.name} · {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'}
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
        ) : (
          <>
            <TripSummaryCard trip={tripQuery.data} isPoster={user?.id === tripQuery.data.postedByUserId} />
            <Applicants trip={tripQuery.data} isPoster={user?.id === tripQuery.data.postedByUserId} from={from} />
          </>
        )}
      </div>
    </div>
  );
}

export default ApplicantReviewPage;
