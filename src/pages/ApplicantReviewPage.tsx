import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Car, CheckCircle2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useAssignDriver, useRejectApplicant, useTrip, useTripApplicants } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR } from '@/lib/utils';
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
        <Badge variant={meta.variant}>
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
      ) : null}
    </Card>
  );
}

function Applicants({ trip, isPoster }: { trip: Trip; isPoster: boolean }) {
  const applicantsQuery = useTripApplicants(trip.id);
  const assign = useAssignDriver();
  const reject = useRejectApplicant();
  const assignable = trip.status === 'open' || trip.status === 'has_applicants';
  const canAct = isPoster && assignable;
  const applicants = applicantsQuery.data ?? [];

  function onAssign(acceptanceId: string) {
    assign.mutate(
      { tripId: trip.id, acceptanceId },
      { onSuccess: () => toast.success('Driver selected — an OTP is now generated for the passenger'), onError: () => toast.error("Couldn't select that driver — try again.") },
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

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(id ? `/trips/${id}` : '/posted-trips')} className="-ml-2">
        <ArrowLeft className="size-4" aria-hidden /> Back to the trip
      </Button>

      {notFound ? (
        <ErrorState title="Trip not found" message="This trip may have been removed." />
      ) : tripQuery.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : tripQuery.isError ? (
        <ErrorState title="Couldn't load this trip" message="Check your connection and try again." onRetry={() => void tripQuery.refetch()} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-1.5 text-xl font-bold">
                <Star className="size-4 text-secondary" aria-hidden /> Applicants
              </h1>
              <p className="text-sm text-secondary">
                {tripQuery.data.fromCity.name} → {tripQuery.data.toCity.name} · {tripQuery.data.applicantCount} applicant{tripQuery.data.applicantCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <Applicants trip={tripQuery.data} isPoster={user?.id === tripQuery.data.postedByUserId} />
        </>
      )}
    </main>
  );
}

export default ApplicantReviewPage;
