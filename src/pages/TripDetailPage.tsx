import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Car, Info, MapPin, User, Users, Wallet } from 'lucide-react';
import { useTrip } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { TripReviewSection } from '@/components/reviews/TripReviewSection';
import { Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR, formatKm } from '@/lib/utils';
import type { Trip, TripStatus } from '@/types';

const STATUS_BADGE = {
  open: { label: 'Open', variant: 'success' },
  has_applicants: { label: 'Has applicants', variant: 'warning' },
  assigned: { label: 'Assigned', variant: 'info' },
  in_progress: { label: 'In progress', variant: 'info' },
  completed: { label: 'Completed', variant: 'muted' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
} as const satisfies Record<TripStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }>;

function dateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-secondary [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function FareLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${strong ? 'border-t pt-2 font-bold' : ''}`}>
      <span className={strong ? '' : 'text-secondary'}>{label}</span>
      <span className={strong ? 'text-lg' : 'font-medium'}>{value}</span>
    </div>
  );
}

function TripDetail({ trip, isDriver }: { trip: Trip; isDriver: boolean }) {
  const badge = STATUS_BADGE[trip.status];
  const applyable = trip.status === 'open' || trip.status === 'has_applicants';
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {trip.fromCity.name} → {trip.toCity.name}
          </h1>
          <p className="text-sm text-secondary">Posted by {trip.postedByName} ({trip.postedByRole === 'driver' ? 'driver' : 'agent'})</p>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {trip.assignedDriverId ? (
        <Card>
          <Link to={`/drivers/${trip.assignedDriverId}`} className="flex items-center gap-2 text-sm font-medium text-primary">
            <User className="size-4" aria-hidden /> View the assigned driver&apos;s profile →
          </Link>
        </Card>
      ) : null}

      <Card className="gap-3">
        <Row icon={<MapPin />} label="Route" value={`${trip.fromCity.name} → ${trip.toCity.name} · ${formatKm(trip.expectedDistanceKm)}`} />
        <Row icon={<Calendar />} label="Pickup" value={dateTime(trip.pickupAt)} />
        <Row icon={<Car />} label="Vehicle" value={`${trip.carTypeLabel ?? 'Any'}${trip.acRequired ? ' · AC' : ''} · ${trip.seatsRequired} seat${trip.seatsRequired === 1 ? '' : 's'}`} />
        {trip.driverInstructions ? <Row icon={<Info />} label="Instructions for the driver" value={trip.driverInstructions} /> : null}
      </Card>

      <Card className="gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
          <Wallet className="size-3.5" aria-hidden /> Fare
        </div>
        <FareLine label={`Total fare (${formatKm(trip.expectedDistanceKm)} × ${formatINR(trip.ratePerKm)}/km)`} value={formatINR(trip.totalFare)} />
        <FareLine label={`Platform commission (${trip.commissionPct}%)`} value="—" />
        <FareLine label="GST" value={formatINR(trip.gstAmount)} />
        <FareLine label="Driver bata" value={`+ ${formatINR(trip.driverBata)}`} />
        <FareLine label="Driver payout" value={formatINR(trip.driverPayout)} strong />
        <p className="text-xs text-secondary">Packing / toll / permit extras: {trip.extrasPaidByPassenger ? 'paid by the passenger' : 'included in the fare'}.</p>
      </Card>

      <Card className="gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Passenger</div>
        <Row icon={<Users />} label="Name & headcount" value={`${trip.passengerName || '—'} · ${trip.passengerCount} pax`} />
        {!trip.hidePassengerPhone && trip.passengerPhone ? <Row icon={<Info />} label="Phone" value={trip.passengerPhone} /> : null}
        {trip.luggageNotes ? <Row icon={<Info />} label="Luggage" value={trip.luggageNotes} /> : null}
        {trip.specialRequests ? <Row icon={<Info />} label="Special requests" value={trip.specialRequests} /> : null}
      </Card>

      {trip.status === 'completed' ? <TripReviewSection trip={trip} /> : null}

      {isDriver && applyable ? (
        <Card className="border-dashed">
          <p className="text-sm text-secondary">
            Applying to trips (pick one of your vehicles, optionally counter-quote) is coming with the driver-profile screen — see <code>docs/CONTINUE_HERE_FRONTEND.md</code>.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * `/trips/:id` — full trip detail. Public read via `useTrip` (the apply / withdraw
 * actions for drivers land with the driver-profile screen — they need the caller's
 * driver id, which isn't yet exposed by the API).
 */
export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tripQuery = useTrip(id);

  const goBack = () => navigate('/trips');
  const notFound = !id || (tripQuery.isError && tripQuery.error instanceof ApiError && tripQuery.error.status === 404);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2">
        <ArrowLeft className="size-4" aria-hidden /> Back to trips
      </Button>

      {notFound ? (
        <ErrorState title="Trip not found" message="This trip may have been removed, or the link is out of date." />
      ) : tripQuery.isPending ? (
        <LoadingSkeleton rows={6} />
      ) : tripQuery.isError ? (
        <ErrorState title="Couldn't load this trip" message="Check your connection and try again." onRetry={() => void tripQuery.refetch()} />
      ) : (
        <TripDetail trip={tripQuery.data} isDriver={user?.role === 'driver'} />
      )}
    </main>
  );
}

export default TripDetailPage;
