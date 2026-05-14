import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Car, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAssignDriver, useRejectApplicant, useTrip, useTripApplicants } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { PassengerLinkModal } from '@/components/share/PassengerLinkModal';
import { Avatar, AvatarFallback, Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR, formatKm, initials } from '@/lib/utils';
import type { AcceptanceStatus, Trip, TripAcceptance } from '@/types';

const STATUS_BADGE: Record<AcceptanceStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  applied: { label: 'Applied', variant: 'warning' },
  selected: { label: 'Selected', variant: 'success' },
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
  const meta = STATUS_BADGE[acceptance.status];
  const dim = acceptance.status === 'rejected' || acceptance.status === 'withdrawn' || acceptance.status === 'expired';
  return (
    <Card className={`gap-3 ${acceptance.status === 'selected' ? 'border-emerald-300 bg-emerald-50/40' : dim ? 'opacity-70' : ''}`}>
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
          <div className="text-xs text-secondary">
            {d && d.ratingCount > 0 ? (
              <>
                <span className="font-semibold text-amber-600">★ {d.ratingAvg.toFixed(1)}</span> · {d.ratingCount} · {d.totalTripsCompleted} trips ·{' '}
              </>
            ) : null}
            applied {appliedAt(acceptance.appliedAt)}
          </div>
        </div>
        <Badge variant={meta.variant} className="shrink-0">
          {acceptance.status === 'selected' ? <CheckCircle2 className="size-3" aria-hidden /> : null} {meta.label}
        </Badge>
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
          <Button variant="full" size="sm" onClick={onAssign} disabled={assigning || rejecting}>
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

function Applicants({ trip, isPoster }: { trip: Trip; isPoster: boolean }) {
  const applicantsQuery = useTripApplicants(trip.id);
  const assign = useAssignDriver();
  const reject = useRejectApplicant();
  const navigate = useNavigate();
  const assignable = trip.status === 'open' || trip.status === 'has_applicants';
  const canAct = isPoster && assignable;
  const applicants = applicantsQuery.data ?? [];
  const [assignedTrip, setAssignedTrip] = useState<Trip | null>(null);

  function onAssign(acceptanceId: string) {
    assign.mutate(
      { tripId: trip.id, acceptanceId },
      {
        onSuccess: (updated) => {
          if (!updated.passengerName) {
            // No passenger details yet — go to the trip and prompt the agent to fill them in.
            toast.success('Driver selected — add the passenger details to complete the booking.');
            navigate(`/trips/${trip.id}?fillPassenger=1`);
          } else {
            toast.success('Driver selected — share the trip link with the passenger.');
            if (updated.passengerOtp) setAssignedTrip(updated);
          }
        },
        onError: () => toast.error("Couldn't select that driver — try again."),
      },
    );
  }
  function onReject(acceptanceId: string) {
    reject.mutate({ tripId: trip.id, acceptanceId }, { onError: () => toast.error("Couldn't reject that applicant — try again.") });
  }

  if (applicantsQuery.isPending) return <LoadingSkeleton rows={3} />;
  if (applicantsQuery.isError) return <ErrorState title="Couldn't load the applicants" message="Check your connection and try again." onRetry={() => void applicantsQuery.refetch()} />;
  if (applicants.length === 0) return <Card><p className="text-sm text-secondary">No one has applied to this trip yet.</p></Card>;

  return (
    <div className="space-y-3">
      {!isPoster ? <p className="text-xs text-secondary">You can review applicants but only the trip poster can select one.</p> : null}
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
      {assignedTrip && assignedTrip.passengerOtp ? <PassengerLinkModal trip={assignedTrip} otp={assignedTrip.passengerOtp} onClose={() => setAssignedTrip(null)} /> : null}
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
  const { user } = useAuth();
  const tripQuery = useTrip(id);
  const notFound = !id || (tripQuery.isError && tripQuery.error instanceof ApiError && tripQuery.error.status === 404);
  const trip = tripQuery.data;

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button type="button" aria-label="Back to your posted trips" onClick={() => navigate('/posted-trips')} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
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
            <Card className="gap-1">
              <div className="font-bold">
                {tripQuery.data.fromCity.name} → {tripQuery.data.toCity.name}
              </div>
              <div className="text-xs text-secondary">
                {formatKm(tripQuery.data.expectedDistanceKm)} · {formatINR(tripQuery.data.ratePerKm)}/km · {formatINR(tripQuery.data.totalFare)} fare · {formatINR(tripQuery.data.driverPayout)} driver payout
              </div>
            </Card>
            <Applicants trip={tripQuery.data} isPoster={user?.id === tripQuery.data.postedByUserId} />
          </>
        )}
      </div>
    </div>
  );
}

export default ApplicantReviewPage;
