import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, Clock, MapPin, MessageCircle, Phone, User, Users, Wallet } from 'lucide-react';
import { useApplyToTrip, useTrip, useWithdrawApplication } from '@/hooks/useTrips';
import { useMyDriver } from '@/hooks/useDrivers';
import { useDriverVehicles } from '@/hooks/useVehicles';
import { useAuth } from '@/contexts/AuthContext';
import { useMyApplicationsStore, timeAgo, type MyApplication } from '@/stores/myApplicationsStore';
import { TripReviewSection } from '@/components/reviews/TripReviewSection';
import { Avatar, AvatarFallback, Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { toast } from 'sonner';
import { cn, formatINR, formatKm, initials } from '@/lib/utils';
import type { Trip, TripStatus, Vehicle } from '@/types';

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
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function vehicleLabel(v: Vehicle): string {
  return [v.makeLabel, v.modelName].filter(Boolean).join(' ') || v.carTypeLabel || v.registrationNumber || 'Vehicle';
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-secondary [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-secondary">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}
function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between text-sm', strong && 'border-t pt-2 font-bold')}>
      <span className={muted ? 'text-secondary' : undefined}>{label}</span>
      <span className={cn(strong ? 'text-lg text-emerald-700' : muted ? 'text-secondary' : 'font-medium')}>{value}</span>
    </div>
  );
}

/** Driver-only bottom CTA: pick a vehicle, optionally counter-quote, apply / withdraw. */
function ApplyBar({ trip, myDriverId, myDriverPending, myDriverMissing }: { trip: Trip; myDriverId?: string; myDriverPending: boolean; myDriverMissing: boolean }) {
  const navigate = useNavigate();
  const vehiclesQuery = useDriverVehicles(myDriverId);
  const applyMutation = useApplyToTrip();
  const withdrawMutation = useWithdrawApplication();
  const { byTrip, recordApplication, clearApplication } = useMyApplicationsStore();
  const myApplication: MyApplication | undefined = byTrip[trip.id];

  const activeVehicles = (vehiclesQuery.data ?? []).filter((v) => v.isActive);
  const [vehicleId, setVehicleId] = useState('');
  const [showQuote, setShowQuote] = useState(false);
  const [quoteRate, setQuoteRate] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const chosenVehicleId = vehicleId || activeVehicles[0]?.id;
  const busy = applyMutation.isPending || withdrawMutation.isPending;
  const isApplied = !!myApplication;

  async function onApply() {
    if (!chosenVehicleId) {
      toast.error('Add a vehicle from your profile before applying.');
      return;
    }
    const rate = Number(quoteRate);
    try {
      const acc = await applyMutation.mutateAsync({ tripId: trip.id, input: { vehicleId: chosenVehicleId, quotedRatePerKm: Number.isFinite(rate) && rate > 0 ? Math.round(rate) : undefined, message: quoteNote.trim() || undefined } });
      recordApplication({ tripId: trip.id, acceptanceId: acc.id, appliedAt: acc.appliedAt, quotedRatePerKm: acc.applicantQuotedRatePerKm, message: acc.applicantMessage });
      toast.success('Applied — the trip manager has been notified.');
    } catch {
      toast.error("Couldn't apply — please try again.");
    }
  }
  async function onWithdraw() {
    if (!myApplication) return;
    try {
      await withdrawMutation.mutateAsync({ tripId: trip.id, acceptanceId: myApplication.acceptanceId });
      clearApplication(trip.id);
      toast.success('Application withdrawn.');
    } catch {
      toast.error("Couldn't withdraw — please try again.");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md space-y-2 border-t bg-white px-4 py-3">
      {isApplied ? (
        <>
          <div className="flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-900">
            <CheckCircle2 className="size-4" aria-hidden /> Applied
          </div>
          <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" disabled={busy} onClick={() => void onWithdraw()}>
            {withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw application'}
          </Button>
        </>
      ) : myDriverMissing ? (
        <Button variant="full" size="lg" onClick={() => navigate('/profile')}>
          Set up your driver profile to apply
        </Button>
      ) : myDriverPending || vehiclesQuery.isPending ? (
        <Button variant="full" size="lg" disabled>
          Loading…
        </Button>
      ) : activeVehicles.length === 0 ? (
        <>
          <p className="text-center text-xs text-secondary">Add a vehicle from your profile to apply for trips.</p>
          <Button variant="full" size="lg" onClick={() => navigate('/profile')}>
            Add a vehicle
          </Button>
        </>
      ) : (
        <>
          {activeVehicles.length > 1 ? (
            <label className="block text-xs text-secondary">
              Apply with
              <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={chosenVehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {activeVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {showQuote ? (
            <div className="space-y-2 rounded-lg border bg-white p-2.5">
              <label className="flex items-center gap-2 text-sm">
                <span className="shrink-0 text-secondary">My rate ₹</span>
                <input type="number" inputMode="decimal" min={1} value={quoteRate} onChange={(e) => setQuoteRate(e.target.value)} placeholder={String(trip.ratePerKm)} className="h-9 w-full rounded-md border border-input px-2 text-sm" />
                <span className="shrink-0 text-secondary">/km</span>
              </label>
              <input value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} placeholder="Short note to the manager (optional)" maxLength={140} className="h-9 w-full rounded-md border border-input px-2.5 text-sm" />
            </div>
          ) : null}
          <button type="button" onClick={() => setShowQuote((v) => !v)} className="w-full text-xs text-secondary hover:text-foreground">
            {showQuote ? 'Hide rate / note ▲' : 'Quote a different rate · add a note ▼'}
          </button>
          <Button variant="full" size="lg" disabled={busy} onClick={() => void onApply()}>
            {applyMutation.isPending ? 'Applying…' : 'Apply for this trip'}
          </Button>
        </>
      )}
    </div>
  );
}

function PostedBy({ trip }: { trip: Trip }) {
  const isAgentPost = trip.postedByRole !== 'driver';
  const phone = trip.postedByPhone?.trim();
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined;
  const sms = phone ? `sms:${phone.replace(/[^\d+]/g, '')}` : undefined;
  return (
    <Card className="gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Posted by</div>
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          <AvatarFallback>{initials(trip.postedByName || '?')}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-bold">
            {trip.postedByName || 'Unknown'}
            <Badge variant={isAgentPost ? 'info' : 'muted'} className="shrink-0 text-[10px]">
              {isAgentPost ? 'Agent' : 'Driver'}
            </Badge>
          </div>
          <div className="truncate text-xs text-secondary">{isAgentPost ? 'Posts trips for drivers' : 'Another driver passing on a trip'}</div>
          {phone ? <div className="mt-0.5 font-mono text-xs text-secondary">{phone}</div> : null}
        </div>
      </div>
      {phone ? (
        <div className="flex gap-2">
          <Button asChild size="sm" className="flex-1">
            <a href={tel} aria-label={`Call ${trip.postedByName}`}>
              <Phone className="size-4" aria-hidden /> Call
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={sms} aria-label={`Message ${trip.postedByName}`}>
              <MessageCircle className="size-4" aria-hidden /> Message
            </a>
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function TripDetail({ trip, viewer }: { trip: Trip; viewer: { isDriver: boolean; isPoster: boolean; isAdmin: boolean; myDriverId?: string; myDriverPending: boolean; myDriverMissing: boolean } }) {
  const badge = STATUS_BADGE[trip.status];
  const commissionAmount = Math.round((trip.totalFare * trip.commissionPct) / 100);
  const instructionLines = (trip.driverInstructions ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const applyable = trip.status === 'open' || trip.status === 'has_applicants';
  const showApplyBar = viewer.isDriver && !viewer.isPoster && applyable;
  const myApplication: MyApplication | undefined = useMyApplicationsStore().byTrip[trip.id];

  return (
    <div className={cn('flex-1 space-y-3 p-4', showApplyBar && 'pb-40')}>
      <Card className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-2xl font-bold leading-tight">
            {trip.fromCity.name} → {trip.toCity.name}
          </div>
          <Badge variant={badge.variant} className="mt-1 shrink-0">
            {badge.label}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<MapPin />} label="Distance" value={formatKm(trip.expectedDistanceKm)} />
          <Stat icon={<Clock />} label="Pickup" value={dateTime(trip.pickupAt)} />
          <Stat icon={<Users />} label="Passengers" value={`${trip.passengerCount} pax · ${trip.seatsRequired} seat${trip.seatsRequired === 1 ? '' : 's'}`} />
          <Stat icon={<Wallet />} label="Rate" value={`${formatINR(trip.ratePerKm)}/km`} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {trip.carTypeLabel ? <Badge variant="outline">{trip.carTypeLabel}</Badge> : null}
          {trip.acRequired ? <Badge variant="outline">AC required</Badge> : null}
        </div>
      </Card>

      <Card className="gap-2">
        <div className="font-semibold">Payout breakdown</div>
        <Line label={`Trip fare (${formatKm(trip.expectedDistanceKm)} × ${formatINR(trip.ratePerKm)}/km)`} value={formatINR(trip.totalFare)} />
        <Line label={`− Platform commission (${trip.commissionPct}%)`} value={`− ${formatINR(commissionAmount)}`} muted />
        <Line label="− GST" value={`− ${formatINR(trip.gstAmount)}`} muted />
        <Line label="+ Driver bata" value={`+ ${formatINR(trip.driverBata)}`} />
        <Line label="Driver payout" value={formatINR(trip.driverPayout)} strong />
        <p className="text-xs text-secondary">🧳 Packing / toll / permit extras — {trip.extrasPaidByPassenger ? 'paid by the passenger' : 'included in the fare'}.</p>
      </Card>

      {instructionLines.length > 0 ? (
        <Card className="gap-2">
          <div className="flex items-center gap-1.5 font-semibold">
            <ClipboardList className="size-4 text-secondary" aria-hidden /> Driver instructions
          </div>
          {instructionLines.length === 1 ? (
            <p className="text-sm text-foreground">{instructionLines[0]}</p>
          ) : (
            <ol className="list-inside list-decimal space-y-1 text-sm text-foreground">
              {instructionLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )}
        </Card>
      ) : null}

      <PostedBy trip={trip} />

      <Card className="gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Passenger</div>
        <Stat icon={<Users />} label="Name & headcount" value={`${trip.passengerName || '—'} · ${trip.passengerCount} pax`} />
        {!trip.hidePassengerPhone && trip.passengerPhone ? <Stat icon={<Phone />} label="Phone" value={trip.passengerPhone} /> : null}
        {trip.luggageNotes ? <Stat icon={<ClipboardList />} label="Luggage" value={trip.luggageNotes} /> : null}
        {trip.specialRequests ? <Stat icon={<ClipboardList />} label="Special requests" value={trip.specialRequests} /> : null}
      </Card>

      {trip.assignedDriverId ? (
        <Card>
          <Link to={`/drivers/${trip.assignedDriverId}`} className="flex items-center gap-2 text-sm font-medium text-primary">
            <User className="size-4" aria-hidden /> View the assigned driver&apos;s profile →
          </Link>
        </Card>
      ) : null}

      {(viewer.isPoster || viewer.isAdmin) && trip.applicantCount > 0 ? (
        <Card>
          <Link to={`/trips/${trip.id}/applicants`} className="text-sm font-medium text-primary">
            🤝 Review {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'} →
          </Link>
        </Card>
      ) : null}

      {showApplyBar && myApplication ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-emerald-900">You&apos;ve applied — waiting for the trip manager</div>
              <div className="text-xs text-emerald-700">Submitted {timeAgo(myApplication.appliedAt)} · we&apos;ll notify you with their decision.</div>
            </div>
          </div>
        </Card>
      ) : viewer.isDriver && !viewer.isPoster && trip.applicantCount > 0 && applyable ? (
        <Card>
          <p className="text-sm text-secondary">🤝 {trip.applicantCount} driver{trip.applicantCount === 1 ? '' : 's'} applied — a sharp rate helps you stand out.</p>
        </Card>
      ) : null}

      {trip.status === 'completed' ? <TripReviewSection trip={trip} /> : null}

      {showApplyBar ? <ApplyBar trip={trip} myDriverId={viewer.myDriverId} myDriverPending={viewer.myDriverPending} myDriverMissing={viewer.myDriverMissing} /> : null}
    </div>
  );
}

/**
 * `/trips/:id` — full trip detail, laid out like the prototype: route card,
 * payout breakdown, driver instructions, "Posted by" with Call / Message CTAs,
 * applicant prompts, and (for drivers) a fixed Apply / Withdraw bar that picks
 * one of the driver's vehicles and optionally counter-quotes. Read via `useTrip`;
 * the caller's driver id (for apply) comes from `useMyDriver`.
 */
export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isDriver = user?.role === 'driver';
  const tripQuery = useTrip(id);
  const myDriverQuery = useMyDriver(isDriver);
  const myDriverMissing = isDriver && myDriverQuery.isError && myDriverQuery.error instanceof ApiError && myDriverQuery.error.status === 404;

  const goBack = () => (location.key === 'default' ? navigate('/trips') : navigate(-1));
  const notFound = !id || (tripQuery.isError && tripQuery.error instanceof ApiError && tripQuery.error.status === 404);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button type="button" aria-label="Back" onClick={goBack} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="font-semibold">Trip detail</h1>
      </header>

      {notFound ? (
        <div className="p-4">
          <ErrorState title="Trip not found" message="This trip may have been removed, or the link is out of date." />
        </div>
      ) : tripQuery.isPending ? (
        <div className="p-4">
          <LoadingSkeleton rows={6} />
        </div>
      ) : tripQuery.isError ? (
        <div className="p-4">
          <ErrorState title="Couldn't load this trip" message="Check your connection and try again." onRetry={() => void tripQuery.refetch()} />
        </div>
      ) : (
        <TripDetail
          trip={tripQuery.data}
          viewer={{
            isDriver,
            isPoster: !!user && tripQuery.data.postedByUserId === user.id,
            isAdmin: user?.role === 'admin',
            myDriverId: myDriverQuery.data?.id,
            myDriverPending: isDriver && myDriverQuery.isPending,
            myDriverMissing: !!myDriverMissing,
          }}
        />
      )}
    </div>
  );
}

export default TripDetailPage;
