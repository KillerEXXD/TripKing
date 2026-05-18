import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Clock, Info, Loader2, MapPin, MessageCircle, Pencil, Phone, Send, User, Users, UserX, Wallet, XCircle } from 'lucide-react';
import { isTripLive, useAcceptTrip, useApplyToTrip, useCancelAssignment, useCancelTrip, useCompleteTrip, useDeclineTrip, useDeclineTripInvite, useStartTrip, useTrip, useUpdateTripPassenger, useWithdrawApplication } from '@/hooks/useTrips';
import { useNotifications, useMarkNotificationRead } from '@/hooks/useNotifications';
import { useLookupPassengerByPhone, isLookupablePhone } from '@/hooks/usePassengers';
import { useMyDriver } from '@/hooks/useDrivers';
import { useDriverVehicles } from '@/hooks/useVehicles';
import { cancelReasonHooks } from '@/hooks/useAdminConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { useMyApplicationsStore, timeAgo, type MyApplication } from '@/stores/myApplicationsStore';
import { TripReviewSection } from '@/components/reviews/TripReviewSection';
import { TripTracking } from '@/components/trip/TripTracking';
import { routeChainText, TripTypeBadge } from '@/components/trip/RouteChain';
import { EditTripDialog } from '@/components/trip/EditTripDialog';
import { InviteDriversCard } from '@/components/trip/InviteDriversCard';
import { AcceptTripDialog } from '@/components/trip/AcceptTripDialog';
import { DriverLocationReporter } from '@/components/trip/DriverLocationReporter';
import { PassengerLinkModal } from '@/components/share/PassengerLinkModal';
import { InsufficientBalanceModal, type InsufficientBalanceSide } from '@/components/wallet/InsufficientBalanceModal';
import { AgentIdentity } from '@/components/agent/AgentIdentity';
import { DriverIdentity } from '@/components/driver/DriverIdentity';
import { CounterpartyChecklist, AGENT_VERIFICATION_STEPS, DRIVER_VERIFICATION_STEPS } from '@/components/driver';
import { Badge, Button, Card, PriorityCard, StatusBanner } from '@/components/ui';
import { LiveDot } from '@/components/ui/LiveDot';
import { CountdownTimer } from '@/components/ui/CountdownTimer';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { toast } from 'sonner';
import { cn, formatINR, formatKm, formatKmAndDuration, formatPickupDateTime } from '@/lib/utils';
import type { Trip, TripStatus, Vehicle } from '@/types';

// Redesign: prefer the new semantic Badge variants (open / invited / live /
// completed) where they fit the status; fall back to legacy info / warning /
// destructive for the in-between lifecycle states the design system spec
// doesn't name. Matches the STATUS_META map in PostedTripsPage.tsx.
const STATUS_BADGE = {
  open: { label: 'Open', variant: 'open' },
  has_applicants: { label: 'Has applicants', variant: 'warning' },
  selected: { label: 'Awaiting acceptance', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'info' },
  in_progress: { label: 'In progress', variant: 'live' },
  completed: { label: 'Completed', variant: 'completed' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
} as const satisfies Record<TripStatus, { label: string; variant: 'open' | 'invited' | 'live' | 'completed' | 'warning' | 'info' | 'destructive' }>;

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

/** Driver-side banner: renders the diff carried by an unread `trip_updated` notification.
 *  Each change is "before → after" so the driver sees exactly what changed since they
 *  applied. CTAs: "Keep my application" marks the notification read (chip clears on the
 *  Applied list). "Withdraw application" does the same plus fires the withdraw mutation.
 *  Only shows when there's at least one unread trip_updated notification for this trip. */
function TripUpdatedDiffBanner({ tripId, isApplied, acceptanceId }: { tripId: string; isApplied: boolean; acceptanceId?: string }) {
  const { data: notifs } = useNotifications({ unreadOnly: true });
  const markRead = useMarkNotificationRead();
  const withdrawMutation = useWithdrawApplication();
  const clearApplication = useMyApplicationsStore((s) => s.clearApplication);
  const matching = (notifs ?? []).filter((n) => {
    if (n.type !== 'trip_updated') return false;
    const tid = (n.payloadJson as Record<string, unknown>)?.trip_id;
    return tid === tripId;
  });
  if (matching.length === 0) return null;
  // Show the newest notification's changes (the rest will all be marked read on dismiss).
  const latest = matching[0];
  const changes = (((latest.payloadJson as Record<string, unknown>)?.changes) ?? []) as Array<{ label: string; before: unknown; after: unknown; field: string }>;
  const fmt = (field: string, v: unknown): string => {
    if (v == null) return '—';
    if (field === 'pickup_at' || field === 'expected_end_at') {
      const d = new Date(String(v));
      if (!Number.isNaN(d.getTime())) return formatPickupDateTime(d.toISOString());
    }
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  };
  const markAllRead = async () => {
    await Promise.allSettled(matching.map((n) => markRead.mutateAsync(n.id)));
  };
  const onKeep = () => { void markAllRead(); };
  const onWithdraw = async () => {
    if (!acceptanceId) return;
    if (!window.confirm('Withdraw your application from this trip?')) return;
    try {
      await withdrawMutation.mutateAsync({ tripId, acceptanceId });
      clearApplication(tripId);
      await markAllRead();
      toast.success('Application withdrawn.');
    } catch {
      toast.error("Couldn't withdraw — please try again.");
    }
  };
  return (
    <Card className="gap-2 border-2 border-amber-300 bg-amber-50">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-amber-900">The trip manager updated this trip</div>
          <ul className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-white/60 p-2.5 text-xs">
            {changes.map((c) => (
              <li key={c.field} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">{c.label}</span>
                <span>
                  <span className="text-red-700 line-through">{fmt(c.field, c.before)}</span>
                  <span className="mx-1 text-secondary">→</span>
                  <span className="font-semibold text-emerald-700">{fmt(c.field, c.after)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onKeep}>
              {isApplied ? 'Keep my application' : 'Got it'}
            </Button>
            {isApplied && acceptanceId ? (
              <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => void onWithdraw()}>
                Withdraw
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Driver-only bottom CTA: pick a vehicle, optionally counter-quote, apply / withdraw. */
function ApplyBar({ trip, myDriverId, myDriverPending, myDriverMissing, kycApproved, returnTo }: { trip: Trip; myDriverId?: string; myDriverPending: boolean; myDriverMissing: boolean; kycApproved: boolean; returnTo: string }) {
  const navigate = useNavigate();
  const vehiclesQuery = useDriverVehicles(myDriverId);
  const applyMutation = useApplyToTrip();
  const withdrawMutation = useWithdrawApplication();
  const declineInviteMutation = useDeclineTripInvite();
  // The trip detail endpoint stamps `invitationId` + `invitationStatus` for the requesting
  // driver — so an invited driver who hasn't applied yet sees a Decline action alongside Apply.
  const invitedPending = trip.invitationStatus === 'pending' && !!trip.invitationId;
  const { byTrip, recordApplication, markWithdrawn } = useMyApplicationsStore();
  const myApplication: MyApplication | undefined = byTrip[trip.id];

  const activeVehicles = (vehiclesQuery.data ?? []).filter((v) => v.isActive);
  const [vehicleId, setVehicleId] = useState('');
  const chosenVehicleId = vehicleId || activeVehicles[0]?.id;
  const busy = applyMutation.isPending || withdrawMutation.isPending;
  // Two sources of truth for the driver's application on this trip:
  //   1. The local zustand store (`myApplication`) — populated when THIS browser session
  //      called POST /applicants. Includes `withdrawnAt` so we can show the red "withdrawn"
  //      banner without losing the row.
  //   2. The server-side `trip.myApplicationStatus` — present on every GET /trips/:id call
  //      so a re-login / new device / cache-clear scenario still shows the right state.
  // The server-side flag wins when the local store doesn't know about the trip yet.
  const serverApplied = trip.myApplicationStatus === 'applied' || trip.myApplicationStatus === 'selected' || trip.myApplicationStatus === 'accepted';
  const serverWithdrawn = trip.myApplicationStatus === 'withdrawn';
  const withdrawn = !!myApplication?.withdrawnAt || (!myApplication && serverWithdrawn);
  const isApplied = (!!myApplication && !myApplication.withdrawnAt) || (!myApplication && serverApplied);

  async function onApply() {
    if (!chosenVehicleId) {
      toast.error('Add a vehicle from your profile before applying.');
      return;
    }
    try {
      const acc = await applyMutation.mutateAsync({ tripId: trip.id, input: { vehicleId: chosenVehicleId } });
      recordApplication({ tripId: trip.id, acceptanceId: acc.id, appliedAt: acc.appliedAt, quotedRatePerKm: acc.applicantQuotedRatePerKm, message: acc.applicantMessage });
      toast.success('Applied — the trip manager has been notified.');
      // Briefly show the "Applied" pill so the driver sees their action
      // registered, then return them to where they came from (Open Trips).
      setTimeout(() => navigate(returnTo), 900);
    } catch (err) {
      // Surface the server's actual message (`ApiError.message`) instead of a generic toast —
      // 409 "You already applied to this trip" is more useful than "try again". Same pattern
      // for 403 KYC errors. Falls back to the generic copy for unexpected failures.
      const msg = err instanceof ApiError ? err.message : "Couldn't apply — please try again.";
      toast.error(msg);
    }
  }
  async function onDeclineInvite() {
    if (!trip.invitationId) return;
    if (!window.confirm("Decline this invitation? The trip manager will be notified.")) return;
    try {
      await declineInviteMutation.mutateAsync({ tripId: trip.id, inviteId: trip.invitationId });
      toast.success('Invitation declined.');
      navigate(returnTo);
    } catch {
      toast.error("Couldn't decline — please try again.");
    }
  }
  async function onWithdraw() {
    // The acceptance id comes from either the local store (this-session apply) or the
    // server-side `trip.myApplicationId` stamp (re-login / fresh device).
    const acceptanceId = myApplication?.acceptanceId ?? trip.myApplicationId;
    if (!acceptanceId) return;
    try {
      await withdrawMutation.mutateAsync({ tripId: trip.id, acceptanceId });
      // Mark withdrawn (don't delete) so the trip card keeps showing the status
      // in light red — reminds the driver they pulled out and prevents a stale re-apply.
      markWithdrawn(trip.id);
      toast.success('Application withdrawn.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't withdraw — please try again.";
      toast.error(msg);
    }
  }

  const declining = declineInviteMutation.isPending;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md space-y-2 border-t bg-white px-4 py-3">
      {invitedPending && !isApplied && !withdrawn ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-900">
          You&apos;ve been invited to this trip
        </div>
      ) : null}
      {withdrawn ? (
        <>
          <div className="flex items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-3 text-sm font-bold text-red-800">
            <XCircle className="size-4" aria-hidden /> Application withdrawn
          </div>
          <p className="px-2 text-center text-xs text-red-700/80">You withdrew {myApplication?.withdrawnAt ? timeAgo(myApplication.withdrawnAt) : ''}. Re-apply below if you change your mind.</p>
        </>
      ) : isApplied ? (
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
      ) : !kycApproved ? (
        <>
          <p className="text-center text-xs text-secondary">Finish your verification (KYC) before you can apply to trips.</p>
          <Button variant="full" size="lg" onClick={() => navigate('/profile#get-verified')}>
            Get verified to apply →
          </Button>
        </>
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
          <Button variant="full" size="lg" disabled={busy} onClick={() => void onApply()}>
            {applyMutation.isPending ? 'Applying…' : 'Apply for this trip'}
          </Button>
        </>
      )}
      {invitedPending && !isApplied && !withdrawn ? (
        <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" disabled={declining} onClick={() => void onDeclineInvite()}>
          {declining ? 'Declining…' : 'Decline invitation'}
        </Button>
      ) : null}
    </div>
  );
}

/** Assigned-driver bottom CTA: start the trip with the passenger's OTP, then complete it. */
function AcceptedDriverBar({ trip }: { trip: Trip }) {
  const startMutation = useStartTrip();
  const completeMutation = useCompleteTrip();
  const [showStartForm, setShowStartForm] = useState(false);
  const [otp, setOtp] = useState('');
  const [startOdo, setStartOdo] = useState('');
  const [insufficient, setInsufficient] = useState<{ side: InsufficientBalanceSide; message?: string } | null>(null);

  async function onStart() {
    const code = otp.trim();
    if (code.length < 4) {
      toast.error("Enter the passenger's OTP to start the trip.");
      return;
    }
    const odoNum = Number(startOdo);
    if (!Number.isFinite(odoNum) || odoNum <= 0) {
      toast.error('Enter your odometer reading before starting.');
      return;
    }
    try {
      await startMutation.mutateAsync({ tripId: trip.id, input: { passengerOtp: code, startOdoReading: odoNum } });
      toast.success('Trip started — drive safe.');
      setShowStartForm(false);
      setOtp('');
      setStartOdo('');
    } catch {
      toast.error("That OTP didn't match — double-check it with the passenger.");
    }
  }
  async function onComplete() {
    try {
      await completeMutation.mutateAsync({ tripId: trip.id });
      toast.success('Trip completed — your payout is queued.');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'INSUFFICIENT_WALLET_BALANCE_DRIVER' || err.code === 'INSUFFICIENT_WALLET_BALANCE_AGENT')) {
        setInsufficient({ side: err.code === 'INSUFFICIENT_WALLET_BALANCE_DRIVER' ? 'driver' : 'agent', message: err.message });
        return;
      }
      toast.error("Couldn't complete the trip — please try again.");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md space-y-2 border-t bg-white px-4 py-3">
      <div className="text-center text-xs font-semibold text-primary">You&apos;re driving this trip</div>
      {trip.status === 'accepted' ? (
        <>
          {showStartForm ? (
            <>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Passenger OTP"
                aria-label="Passenger OTP"
                className="h-11 w-full rounded-md border border-input bg-white text-center font-mono text-lg tracking-[0.3em]"
              />
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={startOdo}
                onChange={(e) => setStartOdo(e.target.value)}
                placeholder="Start odometer reading (km)"
                aria-label="Start odometer reading in kilometres"
                className="h-11 w-full rounded-md border border-input bg-white px-3 text-base"
              />
              <Button variant="full" size="lg" disabled={startMutation.isPending} onClick={() => void onStart()}>
                {startMutation.isPending ? 'Starting…' : 'Start the trip'}
              </Button>
            </>
          ) : (
            <Button variant="full" size="lg" onClick={() => setShowStartForm(true)}>
              Start the trip
            </Button>
          )}
        </>
      ) : (
        <Button variant="full" size="lg" disabled={completeMutation.isPending} onClick={() => void onComplete()}>
          {completeMutation.isPending ? 'Completing…' : 'Complete the trip'}
        </Button>
      )}
      {insufficient ? (
        <InsufficientBalanceModal side={insufficient.side} message={insufficient.message} onClose={() => setInsufficient(null)} />
      ) : null}
    </div>
  );
}

/** Poster-only: cancel a still-open/assigned trip with a reason (applicants get notified). */
function CancelTripCard({ trip }: { trip: Trip }) {
  const cancelMutation = useCancelTrip();
  const reasonsQuery = cancelReasonHooks.useList();
  const [open, setOpen] = useState(false);
  const [reasonId, setReasonId] = useState('');
  const reasons = (reasonsQuery.data ?? []).filter((r) => r.isActive && (r.appliesTo === 'agent' || r.appliesTo === 'both'));

  async function onConfirm() {
    if (!reasonId) {
      toast.error('Pick a reason for cancelling.');
      return;
    }
    try {
      await cancelMutation.mutateAsync({ tripId: trip.id, cancelReasonId: reasonId });
      toast.success('Trip cancelled.');
      // the trip query invalidates → status flips to "cancelled" → this card stops rendering.
    } catch {
      toast.error("Couldn't cancel the trip — please try again.");
    }
  }

  if (!open) {
    return (
      <Card className="gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Cancel</div>
        <p className="text-xs text-secondary">If this trip can no longer run, cancel it — anyone who applied is notified.</p>
        <Button variant="ghost" size="sm" className="w-fit text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
          <XCircle className="size-4" aria-hidden /> Cancel this trip
        </Button>
      </Card>
    );
  }
  return (
    <Card className="gap-2 border-destructive/30">
      <div className="text-sm font-semibold text-destructive">Cancel this trip?</div>
      {reasonsQuery.isPending ? (
        <p className="text-xs text-secondary">Loading reasons…</p>
      ) : reasonsQuery.isError ? (
        <ErrorState title="Couldn't load cancellation reasons" message="Check your connection and try again." onRetry={() => void reasonsQuery.refetch()} />
      ) : (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Reason</span>
          <select className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" value={reasonId} onChange={(e) => setReasonId(e.target.value)} aria-label="Cancellation reason">
            <option value="">Pick a reason</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="destructive" size="sm" disabled={!reasonId || cancelMutation.isPending} onClick={() => void onConfirm()}>
          {cancelMutation.isPending ? 'Cancelling…' : 'Confirm cancellation'}
        </Button>
        <Button variant="outline" size="sm" disabled={cancelMutation.isPending} onClick={() => { setOpen(false); setReasonId(''); }}>
          Keep the trip
        </Button>
      </div>
    </Card>
  );
}

function PostedBy({ trip }: { trip: Trip }) {
  const isAgentPost = trip.postedByRole !== 'driver';
  const phone = trip.postedByPhone?.trim();
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined;
  const sms = phone ? `sms:${phone.replace(/[^\d+]/g, '')}` : undefined;
  const callLabel = trip.postedByName ?? `${isAgentPost ? 'agent' : 'driver'} ${trip.postedByHandle}`;
  return (
    <Card className="gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Posted by</div>
      <AgentIdentity
        handle={trip.postedByHandle}
        name={trip.postedByName}
        kycStatus={trip.postedByKycStatus}
        size="lg"
        sub={
          <div className="flex items-center gap-1.5">
            <Badge variant={isAgentPost ? 'info' : 'muted'} className="shrink-0 text-[10px]">
              {isAgentPost ? 'Agent' : 'Driver'}
            </Badge>
            <span className="truncate">{isAgentPost ? 'Posts trips for drivers' : 'Another driver passing on a trip'}</span>
          </div>
        }
      />
      {phone ? <div className="font-mono text-xs text-secondary">{phone}</div> : null}
      {phone ? (
        <div className="flex gap-2">
          <Button asChild size="sm" className="flex-1">
            <a href={tel} aria-label={`Call ${callLabel}`}>
              <Phone className="size-4" aria-hidden /> Call
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={sms} aria-label={`Message ${callLabel}`}>
              <MessageCircle className="size-4" aria-hidden /> Message
            </a>
          </Button>
        </div>
      ) : null}
      {/* Server attaches this only when the viewer is the assigned driver — they get to see how
          thoroughly the poster who hired them is verified. No document URLs. */}
      {trip.postedByVerification ? (
        <CounterpartyChecklist
          verification={trip.postedByVerification}
          steps={isAgentPost ? AGENT_VERIFICATION_STEPS : DRIVER_VERIFICATION_STEPS}
        />
      ) : null}
    </Card>
  );
}

interface PassengerForm {
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageNotes: string;
  specialRequests: string;
  hidePassengerPhone: boolean;
}

/** Inline form for the poster to enter / update passenger details (editable until trip starts). */
function PassengerEditForm({ trip, onSaved }: { trip: Trip; onSaved?: () => void }) {
  const update = useUpdateTripPassenger();
  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<PassengerForm>({
    defaultValues: {
      passengerName: trip.passengerName,
      passengerPhone: trip.passengerPhone,
      passengerCount: trip.passengerCount,
      luggageNotes: trip.luggageNotes ?? '',
      specialRequests: trip.specialRequests ?? '',
      hidePassengerPhone: trip.hidePassengerPhone,
    },
  });

  const phoneWatch = watch('passengerPhone');
  const [debouncedPhone, setDebouncedPhone] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPhone(phoneWatch.trim()), 350);
    return () => clearTimeout(t);
  }, [phoneWatch]);
  const phoneLookupable = isLookupablePhone(debouncedPhone);
  const passengerLookup = useLookupPassengerByPhone(debouncedPhone);
  const knownPassenger = phoneLookupable && !passengerLookup.isFetching ? (passengerLookup.data ?? null) : null;
  useEffect(() => {
    const p = passengerLookup.data;
    if (p && !getValues('passengerName').trim()) setValue('passengerName', p.name, { shouldValidate: true });
  }, [passengerLookup.data, getValues, setValue]);

  async function onSubmit(values: PassengerForm) {
    try {
      await update.mutateAsync({
        tripId: trip.id,
        input: {
          passengerName: values.passengerName.trim(),
          passengerPhone: values.passengerPhone.trim(),
          passengerCount: Number(values.passengerCount),
          luggageNotes: values.luggageNotes.trim() || undefined,
          specialRequests: values.specialRequests.trim() || undefined,
          hidePassengerPhone: values.hidePassengerPhone,
        },
      });
      toast.success('Passenger details saved.');
      onSaved?.();
    } catch {
      toast.error("Couldn't save — please try again.");
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(onSubmit)(); }} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Passenger name</span>
        <input className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" placeholder="Full name" {...register('passengerName', { required: 'Enter the passenger name' })} />
        {errors.passengerName ? <span className="block text-xs text-red-700">{errors.passengerName.message}</span> : null}
      </label>
      {phoneLookupable && knownPassenger ? (
        <StatusBanner tone="success" title={`✓ Existing passenger — ${knownPassenger.name}`} />
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Passenger phone</span>
          <input inputMode="tel" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" placeholder="+91…" {...register('passengerPhone', { required: 'Enter a phone number' })} />
          {errors.passengerPhone ? <span className="block text-xs text-red-700">{errors.passengerPhone.message}</span> : null}
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Headcount</span>
          <input type="number" min={1} max={20} step={1} inputMode="numeric" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" {...register('passengerCount', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1 && v <= 20) || '1–20' })} />
          {errors.passengerCount ? <span className="block text-xs text-red-700">{errors.passengerCount.message}</span> : null}
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Luggage notes (optional)</span>
        <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" {...register('luggageNotes')} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Special requests (optional)</span>
        <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" {...register('specialRequests')} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" {...register('hidePassengerPhone')} /> Keep passenger details hidden from drivers until assigned
      </label>
      <button type="submit" disabled={update.isPending} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {update.isPending ? <span className="flex items-center justify-center gap-1.5"><Loader2 className="size-4 animate-spin" aria-hidden /> Saving…</span> : 'Save passenger details'}
      </button>
    </form>
  );
}

/**
 * Phase 2 of the two-step handshake — shown to the driver while the trip sits in `selected`.
 * Accept generates the passenger OTP and flips the trip to `assigned`. Decline (or letting the
 * server-side cron expire) bumps the trip back to `has_applicants`.
 */
function SelectedDriverCard({ trip }: { trip: Trip }) {
  const acceptMutation = useAcceptTrip();
  const declineMutation = useDeclineTrip();
  const callHref = trip.postedByPhone ? `tel:${trip.postedByPhone}` : undefined;
  const [confirming, setConfirming] = useState(false);

  async function runAccept(withdrawAcceptanceIds: string[]) {
    setConfirming(false);
    try {
      await acceptMutation.mutateAsync({ tripId: trip.id, withdrawAcceptanceIds });
      toast.success(
        withdrawAcceptanceIds.length > 0
          ? `Accepted — ${withdrawAcceptanceIds.length} overlapping application${withdrawAcceptanceIds.length === 1 ? '' : 's'} withdrawn. The passenger will get an OTP shortly.`
          : "You're confirmed — the passenger will get an OTP shortly.",
      );
    } catch (e) {
      // 409 = race condition (agent withdrew or selection expired between render and tap).
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 409) toast.error('Too late — this trip is no longer available to you. The page has been refreshed.');
      else if (status === 403) toast.error('You need an active KYC-approved profile to accept.');
      else toast.error("Couldn't accept — please try again.");
    }
  }
  async function onDecline() {
    if (!window.confirm("Decline this trip? You won't be re-offered it.")) return;
    try {
      await declineMutation.mutateAsync({ tripId: trip.id });
      toast.success('Trip declined.');
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 409) toast.error('This trip is no longer available — nothing to decline.');
      else toast.error("Couldn't decline — please try again.");
    }
  }
  const busy = acceptMutation.isPending || declineMutation.isPending;
  return (
    <>
      <PriorityCard
        tone="emerald"
        icon={<CheckCircle2 className="size-3.5" aria-hidden />}
        label="You've been selected"
        rightAction={trip.acceptanceDeadlineAt ? (
          <CountdownTimer
            deadline={trip.acceptanceDeadlineAt}
            prefix="Accept within"
            expiredLabel="Expired — being reassigned…"
            className="text-xs text-emerald-800"
          />
        ) : null}
        title="Accept this trip to start."
        subtitle="If you don't respond before the timer hits zero, it'll go back to other applicants."
        footerSlot={
          <div className="flex gap-2">
            <Button variant="full" size="lg" className="flex-1" onClick={() => setConfirming(true)} disabled={busy}>
              {acceptMutation.isPending ? 'Accepting…' : 'Accept'}
            </Button>
            <Button variant="outline" size="lg" className="text-destructive" onClick={() => void onDecline()} disabled={busy}>
              {declineMutation.isPending ? 'Declining…' : 'Decline'}
            </Button>
          </div>
        }
      >
        {trip.postedByName ? (
          <p className="mt-0.5 text-xs text-emerald-800">
            Picked by <b>{trip.postedByName}</b>
            {callHref ? <> · <a href={callHref} className="underline">Call to confirm</a></> : null}
          </p>
        ) : null}
      </PriorityCard>
      <AcceptTripDialog
        trip={trip}
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={(ids) => void runAccept(ids)}
        pending={acceptMutation.isPending}
      />
    </>
  );
}

/** Trip creator's view while waiting for the driver to Accept. */
function AwaitingAcceptanceBanner({ trip }: { trip: Trip }) {
  const cancelMutation = useCancelAssignment();
  const driverName = trip.assignedDriver?.fullName ?? (trip.assignedDriverHandle ? `Driver ${trip.assignedDriverHandle}` : 'the driver');
  const driverPhone = trip.assignedDriver?.phone;
  async function onCancel() {
    if (!window.confirm(`Withdraw the selection of ${driverName}? Other applicants stay available.`)) return;
    try {
      await cancelMutation.mutateAsync({ tripId: trip.id });
      toast.success('Selection withdrawn. Pick another applicant.');
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 409) toast.error('Trip already moved on — page refreshed.');
      else toast.error("Couldn't withdraw — please try again.");
    }
  }
  return (
    <PriorityCard
      tone="amber"
      icon={<Clock className="size-3.5" aria-hidden />}
      label="Awaiting acceptance"
      rightAction={trip.acceptanceDeadlineAt ? (
        <CountdownTimer
          deadline={trip.acceptanceDeadlineAt}
          prefix="Decides within"
          expiredLabel="Expired — finding another driver…"
          className="text-xs text-amber-800"
        />
      ) : null}
      title={<>Waiting for <b>{driverName}</b> to accept.</>}
      footerSlot={
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => void onCancel()} disabled={cancelMutation.isPending}>
            {cancelMutation.isPending ? 'Withdrawing…' : 'Withdraw selection'}
          </Button>
        </div>
      }
    >
      {driverPhone ? (
        <p className="mt-0.5 text-xs text-amber-800">
          <a href={`tel:${driverPhone}`} className="underline">Call them</a> to confirm.
        </p>
      ) : null}
    </PriorityCard>
  );
}

function TripDetail({ trip, viewer, fillPassenger, returnTo }: { trip: Trip; viewer: { isDriver: boolean; isPoster: boolean; iPosted: boolean; isAdmin: boolean; isAssignedDriver: boolean; myDriverId?: string; myDriverPending: boolean; myDriverMissing: boolean; myDriverKycApproved: boolean }; fillPassenger: boolean; returnTo: string }) {
  // Defensive fallback: trip.status comes from the server; an unrecognised value would
  // otherwise crash render with "Cannot read properties of undefined (reading 'variant')".
  const badge = STATUS_BADGE[trip.status] ?? { label: String(trip.status), variant: 'muted' as const };
  const commissionAmount = Math.round((trip.totalFare * trip.commissionPct) / 100);
  const instructionLines = (trip.driverInstructions ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const applyable = trip.status === 'open' || trip.status === 'has_applicants';
  const showApplyBar = viewer.isDriver && !viewer.isPoster && !viewer.iPosted && applyable;
  const showAcceptedBar = viewer.isAssignedDriver && (trip.status === 'accepted' || trip.status === 'in_progress');
  const showTracking = viewer.isPoster || viewer.isAssignedDriver;
  const canCancel = viewer.isPoster && (trip.status === 'open' || trip.status === 'has_applicants' || trip.status === 'accepted');
  const passengerEditable = viewer.isPoster && ['open', 'has_applicants', 'accepted'].includes(trip.status);
  const passengerMissing = !trip.passengerName;
  // Auto-open the passenger edit form when redirected here from the assign flow.
  const [editingPassenger, setEditingPassenger] = useState(fillPassenger && passengerEditable);
  const passengerCardRef = useRef<HTMLDivElement>(null);
  const myApplication: MyApplication | undefined = useMyApplicationsStore().byTrip[trip.id];
  // Server-side fallback when the local store hasn't been hydrated (re-login, fresh
  // device). Lets the "You've applied — waiting…" card render even when localStorage is
  // empty. Same logic as the ApplyBar's `isApplied`.
  const serverApplied = trip.myApplicationStatus === 'applied' || trip.myApplicationStatus === 'selected' || trip.myApplicationStatus === 'accepted';
  const [showShareLink, setShowShareLink] = useState(false);
  // Edit-trip dialog: only when no one has applied / been invited / been selected yet.
  // Server enforces this too (returns 409 if the gate slips).
  const detailsEditable = viewer.isPoster && trip.status === 'open' && trip.applicantCount === 0;
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Scroll to passenger card when auto-opened.
  useEffect(() => {
    if (fillPassenger && passengerEditable) {
      setTimeout(() => passengerCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 300);
    }
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn('flex-1 space-y-3 p-4', (showApplyBar || showAcceptedBar) && 'pb-40')}>
      {/* Driver-side "trip updated by poster" diff banner. Shows when there's an unread
          `trip_updated` notification for this trip, with each change as a strikethrough
          → bold diff line. CTAs: Keep (just dismiss/mark-read) and Withdraw (mark-read
          + fire the existing withdraw mutation). Posters / admins don't see this — they
          ARE the one who edited, so the banner would be self-referential. */}
      {viewer.isDriver && !viewer.isPoster && !viewer.iPosted ? (
        <TripUpdatedDiffBanner
          tripId={trip.id}
          isApplied={(!!myApplication && !myApplication.withdrawnAt) || (!myApplication && serverApplied)}
          acceptanceId={myApplication?.acceptanceId ?? trip.myApplicationId ?? undefined}
        />
      ) : null}
      {viewer.isAssignedDriver && trip.status === 'selected' ? <SelectedDriverCard trip={trip} /> : null}
      {viewer.isPoster && trip.status === 'selected' ? <AwaitingAcceptanceBanner trip={trip} /> : null}
      {/* Agent-side "your driver declined" banner — fires when the trip's most recent driver
       *  decision was 'declined' AND the trip has been bumped back to open / has_applicants.
       *  Re-assigning a new driver resets driverAcceptanceStatus → 'pending' so the banner
       *  auto-clears the moment they pick someone else. */}
      {viewer.isPoster &&
       trip.driverAcceptanceStatus === 'declined' &&
       (trip.status === 'open' || trip.status === 'has_applicants') ? (
        <Card className="border-amber-300 bg-amber-50/80">
          <div className="flex items-start gap-2">
            <UserX className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-amber-900">Your selected driver declined this trip</div>
              <div className="mt-0.5 text-xs text-amber-800">
                {trip.applicantCount > 0
                  ? `Pick another driver — ${trip.applicantCount} applicant${trip.applicantCount === 1 ? '' : 's'} still waiting.`
                  : 'Invite drivers below to keep this trip moving.'}
              </div>
              {trip.applicantCount > 0 ? (
                <Link
                  to={`/trips/${trip.id}/applicants`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-control bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  Review applicants
                </Link>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}
      {viewer.isPoster && (trip.status === 'open' || trip.status === 'has_applicants') ? <InviteDriversCard trip={trip} /> : null}
      {showApplyBar && !myApplication && serverApplied ? (
        // Server says the driver has an applied row but the local store hasn't hydrated
        // it yet (re-login / new device). Render the same "You've applied" card the
        // local-store branch shows, minus the "submitted X ago" line (we don't have the
        // applied_at timestamp without the local row).
        <Card className="border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-emerald-900">
                You&apos;ve applied — waiting for the trip manager
                {trip.applicantCount > 0 ? (
                  <> · {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'} so far</>
                ) : null}
              </div>
              <div className="text-xs text-emerald-700">We&apos;ll notify you with their decision.</div>
            </div>
          </div>
        </Card>
      ) : null}
      {showApplyBar && myApplication ? (
        myApplication.withdrawnAt ? (
          // Withdrawn — soft red wash so the driver remembers they pulled out.
          <Card className="border-red-200 bg-red-50">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-red-900">
                  Application withdrawn
                </div>
                <div className="text-xs text-red-700">You withdrew {timeAgo(myApplication.withdrawnAt)}. Re-apply below if you change your mind.</div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="border-emerald-200 bg-emerald-50">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-900">
                  You&apos;ve applied — waiting for the trip manager
                  {trip.applicantCount > 0 ? (
                    <> · {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'} so far</>
                  ) : null}
                </div>
                <div className="text-xs text-emerald-700">Submitted {timeAgo(myApplication.appliedAt)} · we&apos;ll notify you with their decision.</div>
              </div>
            </div>
          </Card>
        )
      ) : null}
      <Card className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-2xl font-bold leading-tight">
            {routeChainText(trip)}
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-2">
            {isTripLive(trip.status) ? <LiveDot tone={trip.status === 'selected' ? 'amber' : 'emerald'} /> : null}
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </div>
        {detailsEditable ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowEditDialog(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary"
            >
              <Pencil className="size-3" aria-hidden /> Edit trip
            </button>
          </div>
        ) : null}
        {(trip.waypoints?.length ?? 0) >= 3 ? (
          <ol className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
            {(trip.waypoints ?? []).map((w, i) => {
              const name = w.place?.name ?? w.city?.name ?? '—';
              const time = w.arriveAt ? formatPickupDateTime(w.arriveAt) : null;
              const wait = w.waitMinutes > 0 ? (w.waitMinutes >= 60 ? `${Math.round(w.waitMinutes / 60)}h` : `${w.waitMinutes}m`) + ' wait' : null;
              const sub = [time, wait].filter(Boolean).join(' · ');
              return (
                <li key={w.id} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="font-medium">{name}</div>
                    {sub ? <div className="text-xs text-secondary">{sub}</div> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <TripTypeBadge trip={trip} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<MapPin />} label="Distance" value={formatKmAndDuration(trip.expectedDistanceKm)} />
          <Stat icon={<Clock />} label="Pickup" value={formatPickupDateTime(trip.pickupAt)} />
          <Stat icon={<Users />} label="Passengers" value={`${trip.passengerCount} pax · ${trip.seatsRequired} seat${trip.seatsRequired === 1 ? '' : 's'}`} />
          <Stat icon={<Wallet />} label="Rate" value={`${formatINR(trip.ratePerKm)}/km`} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {trip.carTypeLabel ? <Badge variant="outline">{trip.carTypeLabel}</Badge> : null}
          {trip.acRequired ? <Badge variant="outline">AC required</Badge> : null}
          {trip.pendingInvitationCount > 0 ? (
            <Badge variant="info">
              <Send className="size-3" aria-hidden /> {trip.pendingInvitationCount} invited
            </Badge>
          ) : null}
        </div>
      </Card>

      {showTracking ? <TripTracking trip={trip} /> : null}

      {viewer.isPoster && trip.passengerOtp && (trip.status === 'accepted' || trip.status === 'in_progress') ? (
        // Bespoke layout — 3xl mono OTP is the centerpiece and doesn't fit PriorityCard's title slot.
        <Card className="gap-2 border-2 border-emerald-300 bg-emerald-50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Passenger OTP</div>
          <div className="text-center font-mono text-3xl font-bold tracking-[0.3em] text-emerald-900">{trip.passengerOtp}</div>
          <p className="text-xs text-emerald-800">
            Share this code with your passenger. The driver enters it when they meet to start the trip.
          </p>
          {trip.passengerName ? (
            <Button variant="full" size="sm" onClick={() => setShowShareLink(true)}>
              Or send a passenger link (OTP built in)
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Card className="gap-2">
        <div className="font-semibold">Payout breakdown</div>
        <Line label={`Trip fare (${formatKm(trip.expectedDistanceKm)} × ${formatINR(trip.ratePerKm)}/km)`} value={formatINR(trip.totalFare)} />
        <Line label={`− Commission (${trip.commissionPct}%)`} value={`− ${formatINR(commissionAmount)}`} muted />
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

      {/* Passenger card — always visible for the poster; shown to the assigned driver once assigned */}
      {(viewer.isPoster || (viewer.isAssignedDriver && trip.status !== 'open' && trip.status !== 'has_applicants')) ? (
        <Card className="gap-3" ref={passengerCardRef}>
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Passenger</div>
            {passengerEditable ? (
              <button type="button" onClick={() => setEditingPassenger((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary">
                <Pencil className="size-3" aria-hidden /> {editingPassenger ? 'Cancel' : (passengerMissing ? 'Add details' : 'Edit')}
              </button>
            ) : null}
          </div>

          {/* Prompt banner when redirected from assign flow */}
          {fillPassenger && !editingPassenger && passengerMissing ? (
            <StatusBanner tone="warning" icon={<Info />}>
              Almost done — enter the passenger details so the driver knows who to pick up.
            </StatusBanner>
          ) : null}

          {editingPassenger ? (
            <PassengerEditForm trip={trip} onSaved={() => setEditingPassenger(false)} />
          ) : passengerMissing ? (
            <p className="text-sm text-secondary">No passenger details yet.</p>
          ) : (
            <>
              <Stat icon={<Users />} label="Name & headcount" value={`${trip.passengerName} · ${trip.passengerCount} pax`} />
              {!trip.hidePassengerPhone && trip.passengerPhone ? <Stat icon={<Phone />} label="Phone" value={trip.passengerPhone} /> : null}
              {trip.luggageNotes ? <Stat icon={<ClipboardList />} label="Luggage" value={trip.luggageNotes} /> : null}
              {trip.specialRequests ? <Stat icon={<ClipboardList />} label="Special requests" value={trip.specialRequests} /> : null}
            </>
          )}
        </Card>
      ) : null}

      {trip.assignedDriverId && trip.assignedDriver ? (
        <Card className="gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Assigned driver</div>
          <DriverIdentity
            driver={trip.assignedDriver}
            size="lg"
            sub={
              trip.assignedDriver.ratingCount > 0
                ? <span>★ {trip.assignedDriver.ratingAvg.toFixed(1)} · {trip.assignedDriver.totalTripsCompleted} trips</span>
                : <span>{trip.assignedDriver.totalTripsCompleted} trips</span>
            }
          />
          {/* The checklist is server-attached only for poster / admin views — no document URLs, just step status. */}
          {trip.assignedDriver.verification ? (
            <CounterpartyChecklist verification={trip.assignedDriver.verification} steps={DRIVER_VERIFICATION_STEPS} />
          ) : null}
          <Link to={`/drivers/${trip.assignedDriverId}`} className="flex items-center gap-1 text-sm font-medium text-primary">
            View full profile <User className="size-4" aria-hidden />
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

      {!showApplyBar && viewer.isDriver && !viewer.isPoster && !viewer.iPosted && trip.applicantCount > 0 && applyable ? (
        <Card>
          <p className="text-sm text-secondary">🤝 {trip.applicantCount} driver{trip.applicantCount === 1 ? '' : 's'} applied — a sharp rate helps you stand out.</p>
        </Card>
      ) : null}

      {canCancel ? <CancelTripCard trip={trip} /> : null}

      {trip.status === 'completed' ? <TripReviewSection trip={trip} /> : null}

      {viewer.isAssignedDriver ? <DriverLocationReporter driverId={viewer.myDriverId} active={trip.status === 'in_progress'} /> : null}
      {showApplyBar ? <ApplyBar trip={trip} myDriverId={viewer.myDriverId} myDriverPending={viewer.myDriverPending} myDriverMissing={viewer.myDriverMissing} kycApproved={viewer.myDriverKycApproved} returnTo={returnTo} /> : showAcceptedBar ? <AcceptedDriverBar trip={trip} /> : null}
      {showShareLink && trip.passengerOtp ? <PassengerLinkModal trip={trip} otp={trip.passengerOtp} onClose={() => setShowShareLink(false)} /> : null}
      {detailsEditable ? <EditTripDialog trip={trip} open={showEditDialog} onClose={() => setShowEditDialog(false)} /> : null}
    </div>
  );
}

/**
 * `/trips/:id` — full trip detail, laid out like the prototype: route card,
 * payout breakdown, driver instructions, "Posted by" with Call / Message CTAs,
 * applicant prompts, a fixed Apply / Withdraw bar (drivers, on open trips), a
 * Start / Complete bar (the assigned driver — Start verifies the passenger's
 * OTP), and a Cancel-this-trip card (the poster, while the trip is still
 * open / has-applicants / assigned). Read via `useTrip`; the caller's driver id
 * comes from `useMyDriver`.
 */
export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const fillPassenger = params.get('fillPassenger') === '1';
  // `?from=<path>` — set when the user entered from a Home-tab work queue.
  // Overrides the default goBack target so they land back on the queue (which
  // auto-bounces home once empty).
  const from = params.get('from');
  const { user } = useAuth();
  // Effective role honours the admin role-switcher — an admin viewing-as-driver gets the
  // driver flow (Apply bar), not the poster/admin flow.
  const effectiveRole = useEffectiveRole();
  const isDriver = effectiveRole === 'driver';
  const isAdminView = user?.role === 'admin' && effectiveRole === 'admin';
  const tripQuery = useTrip(id);
  const myDriverQuery = useMyDriver(isDriver);
  const myDriverMissing = isDriver && myDriverQuery.isError && myDriverQuery.error instanceof ApiError && myDriverQuery.error.status === 404;

  // Always route to the user's own listing instead of history-back — otherwise the
  // Trip Detail ⇄ Applicants pair creates a circular trap with no exit. When the
  // user entered from a work queue (`?from=...`), return them there instead.
  const goBack = () => navigate(from || (isDriver ? '/my-trips' : '/posted-trips'));
  const notFound = !id || (tripQuery.isError && tripQuery.error instanceof ApiError && tripQuery.error.status === 404);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-surface px-4 py-3 shadow-header">
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
          fillPassenger={fillPassenger}
          returnTo={from || '/trips'}
          viewer={{
            isDriver,
            // An admin viewing-as-driver isn't a poster for this purpose, even if they posted
            // the trip under their agent identity (postedByUserId === user.id).
            isPoster: !isDriver && !!user && tripQuery.data.postedByUserId === user.id,
            // iPosted is role-view-independent — used to suppress the Apply bar so a driver-user
            // who also posted this trip can't apply to their own trip.
            iPosted: !!user && tripQuery.data.postedByUserId === user.id,
            isAdmin: isAdminView,
            isAssignedDriver: !!myDriverQuery.data?.id && tripQuery.data.assignedDriverId === myDriverQuery.data.id,
            myDriverId: myDriverQuery.data?.id,
            myDriverPending: isDriver && myDriverQuery.isPending,
            myDriverMissing: !!myDriverMissing,
            myDriverKycApproved: myDriverQuery.data?.kycStatus === 'approved',
          }}
        />
      )}
    </div>
  );
}

export default TripDetailPage;
