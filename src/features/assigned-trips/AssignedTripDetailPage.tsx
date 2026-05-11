import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  MapPin,
  Calendar,
  Users,
  Car,
  Wallet,
  Camera,
  CheckCircle2,
  StickyNote,
  Package,
  Sparkles,
  AlertTriangle,
  Loader2,
  KeyRound,
  EyeOff,
  ClipboardList,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useTrip } from '@/hooks/useTrips';
import { useGoBack } from '@/hooks/useGoBack';
import { useTripStateStore, applyOverlay } from '@/stores/tripStateStore';
import {
  useTripExecutionStore,
  fileToCappedDataUrl,
  type OdoPhoto,
} from '@/stores/tripExecutionStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TripNotFound } from '@/components/common/TripNotFound';
import { initials, formatINR, formatKm, cn } from '@/lib/utils';
import {
  tripApproxDriverCost,
  tripDriverBata,
  tripDriverInstructions,
  tripExtrasPaidByPassenger,
} from '@/lib/tripDefaults';
import { mockManagers, mockUsers, mockDrivers } from '@/data/mockData';
import { toast } from 'sonner';

/**
 * Driver-side view of a trip they've been assigned.
 *
 * Shows:
 *  - Full route + payout summary
 *  - Passenger card with name, phone, count, luggage, special requests
 *    + one-tap Call / Message
 *  - Trip Manager card with name, business, phone + Call / Message
 *  - Status timeline (Assigned → In progress → Completed) with action CTAs:
 *      • Start trip — capture/upload odometer photo + optional notes
 *      • Complete trip — capture/upload odometer photo + optional notes
 *  - Persisted execution data (start/end times, photos, notes) via
 *    tripExecutionStore so it survives reloads and the manager-side view
 *    can later mirror it (out of scope for the prototype).
 */
export function AssignedTripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const goBack = useGoBack('/driver/my-trips');
  const { user } = useAuth();

  const { data: rawTrip, isLoading } = useTrip(tripId);
  const overlay = useTripStateStore((s) => (tripId ? s.overlays[tripId] : undefined));
  const trip = rawTrip ? applyOverlay(rawTrip, tripId ? { [tripId]: overlay! } : {}) : undefined;

  const execution = useTripExecutionStore((s) =>
    tripId ? s.byTrip[tripId] : undefined,
  );
  const startTrip = useTripExecutionStore((s) => s.startTrip);
  const completeTrip = useTripExecutionStore((s) => s.completeTrip);
  const setNotes = useTripExecutionStore((s) => s.setNotes);

  const [notesDraft, setNotesDraft] = useState<string>(execution?.driverNotes ?? '');
  const [pendingPhotoStage, setPendingPhotoStage] = useState<'start' | 'end' | null>(
    null,
  );
  const [otpEntryMode, setOtpEntryMode] = useState(false);
  const [otpDraft, setOtpDraft] = useState('');
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  // Defensive — driver shouldn't see this if not assigned to them, but for
  // the prototype we just show whatever's at the URL.
  const myDriverId = useMemo(
    () => mockDrivers.find((d) => d.userId === user?.id)?.id,
    [user],
  );

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!trip)
    return (
      <TripNotFound
        title="This trip isn't available"
        message="It may have been reassigned or removed. Check your assigned trips for the latest."
        ctaLabel="My trips"
        ctaTo="/driver/my-trips"
      />
    );

  const isMine = trip.assignedDriverId === myDriverId;
  const started = !!execution?.startedAt;
  const completed = !!execution?.completedAt;

  const poster = (() => {
    const mgr = mockManagers.find((m) => m.userId === trip.postedByUserId);
    if (mgr) {
      return {
        name: mgr.fullName,
        phone: mgr.phone,
        role: 'Trip Manager',
        sub: mgr.businessName,
      };
    }
    const u = mockUsers.find((x) => x.id === trip.postedByUserId);
    return {
      name: trip.postedByName ?? u?.displayName ?? 'Unknown',
      phone: u?.phone ?? '',
      role: u?.role === 'driver' ? 'Driver' : 'Trip Manager',
      sub: undefined as string | undefined,
    };
  })();

  const passengerTel = `tel:${trip.passengerPhone.replace(/[^\d+]/g, '')}`;
  const passengerSms = `sms:${trip.passengerPhone.replace(/[^\d+]/g, '')}`;
  const posterTel = `tel:${poster.phone.replace(/[^\d+]/g, '')}`;
  const posterSms = `sms:${poster.phone.replace(/[^\d+]/g, '')}`;

  const handlePhoto = async (
    stage: 'start' | 'end',
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !tripId) return;
    setPendingPhotoStage(stage);
    try {
      const dataUrl = await fileToCappedDataUrl(file);
      const photo: OdoPhoto = {
        dataUrl,
        filename: file.name,
        capturedAt: new Date().toISOString(),
      };
      if (stage === 'start') {
        startTrip(tripId, photo, notesDraft || undefined);
        toast.success('Trip started — drive safe!');
      } else {
        completeTrip(tripId, photo, notesDraft || undefined);
        toast.success('Trip completed — payout queued for the manager');
      }
    } catch (err) {
      toast.error('Could not process the photo. Try again.');
    } finally {
      setPendingPhotoStage(null);
      e.target.value = '';
    }
  };

  const saveNotes = () => {
    if (!tripId) return;
    setNotes(tripId, notesDraft);
    toast.success('Notes saved');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">Assigned trip</h1>
          <div className="text-xs text-muted-foreground truncate">
            {trip.fromCity.name} → {trip.toCity.name}
          </div>
        </div>
        <StatusBadge started={started} completed={completed} />
      </header>

      <div className="p-4 space-y-4">
        {!isMine && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-700 mt-0.5 shrink-0" />
              <div>
                This trip isn't currently assigned to you. The actions below are
                disabled.
              </div>
            </CardContent>
          </Card>
        )}

        {/* OTP gate hint — shown until trip starts so driver knows what's needed. */}
        {isMine && !started && overlay?.passengerOtp && (
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="flex items-start gap-2.5">
              <div className="size-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <KeyRound className="size-4" />
              </div>
              <div className="text-sm min-w-0 flex-1">
                <div className="font-semibold text-emerald-900">
                  Passenger OTP required to start
                </div>
                <div className="text-xs text-emerald-700/80 mt-0.5">
                  When you reach the pickup point, ask the passenger for their 6-digit
                  OTP. Tap the Start trip button to enter it.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status timeline */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Status
            </div>
            <ol className="space-y-2 text-sm">
              <Step
                done
                label="Selected by trip manager"
                hint="You were chosen for this trip."
              />
              <Step
                done={started}
                label={started ? `Trip started · ${formatDateTime(execution?.startedAt)}` : 'Start trip'}
                hint={
                  started
                    ? undefined
                    : 'Capture odometer photo at pickup before driving off.'
                }
              />
              <Step
                done={completed}
                label={
                  completed
                    ? `Completed · ${formatDateTime(execution?.completedAt)}`
                    : 'Complete trip'
                }
                hint={
                  completed
                    ? undefined
                    : started
                      ? 'Capture odometer photo at drop-off.'
                      : 'After starting the trip.'
                }
              />
            </ol>
          </CardContent>
        </Card>

        {/* Trip summary */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-lg font-bold leading-tight">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat icon={<MapPin />} label="Distance" value={formatKm(trip.expectedDistanceKm)} />
              <Stat
                icon={<Calendar />}
                label="Pickup"
                value={new Date(trip.pickupDateTime).toLocaleString('en-IN', {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                  day: 'numeric',
                  month: 'short',
                })}
              />
              <Stat
                icon={<Car />}
                label="Vehicle"
                value={`${trip.carTypeRequired}${trip.acRequired ? ' · AC' : ''}`}
              />
              <Stat
                icon={<Wallet />}
                label="You get (approx.)"
                value={formatINR(tripApproxDriverCost(trip))}
              />
            </div>
            <div className="text-xs text-muted-foreground italic">
              ₹{trip.ratePerKm}/km · incl. {formatINR(tripDriverBata(trip))} bata ·{' '}
              {tripExtrasPaidByPassenger(trip)
                ? 'packing/toll/permit paid by passenger'
                : 'packing/toll/permit included'}
            </div>
          </CardContent>
        </Card>

        {/* Driver instructions */}
        <Card>
          <CardContent className="space-y-2">
            <div className="font-semibold flex items-center gap-1.5">
              <ClipboardList className="size-4 text-muted-foreground" /> Driver instructions
            </div>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              {tripDriverInstructions(trip).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Passenger card */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Passenger
            </div>
            {!trip.passengerName?.trim() ? (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <div>
                  Passenger details haven't been added yet. The trip manager
                  will share them with you once confirmed — reach them on the
                  contact below.
                </div>
              </div>
            ) : (
              <>
            <div className="flex items-start gap-3">
              <Avatar className="size-12">
                <AvatarFallback>{initials(trip.passengerName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{trip.passengerName}</div>
                {overlay?.hidePassengerPhone ? (
                  <div className="text-xs text-muted-foreground italic flex items-center gap-1 mt-0.5">
                    <EyeOff className="size-3" />
                    Phone hidden by trip manager
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground font-mono">
                    {trip.passengerPhone}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">
                  <Users className="inline size-3 -mt-0.5" /> {trip.passengerCount} pax
                </div>
              </div>
            </div>

            {trip.luggageNotes && (
              <div className="flex items-start gap-2 text-xs px-2 py-1.5 rounded bg-gray-50">
                <Package className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Luggage: </span>
                  {trip.luggageNotes}
                </div>
              </div>
            )}
            {trip.specialRequests && (
              <div className="flex items-start gap-2 text-xs px-2 py-1.5 rounded bg-gray-50">
                <Sparkles className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Special: </span>
                  {trip.specialRequests}
                </div>
              </div>
            )}

            {overlay?.hidePassengerPhone ? (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <EyeOff className="size-3.5 mt-0.5 shrink-0" />
                <div>
                  Trip manager has hidden the passenger's number. Route any
                  pre-trip questions through the trip manager. The passenger
                  will hand over the OTP at pickup.
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button asChild className="flex-1" size="sm">
                  <a href={passengerTel} aria-label={`Call ${trip.passengerName}`}>
                    <Phone className="size-4" /> Call
                  </a>
                </Button>
                <Button asChild className="flex-1" size="sm" variant="outline">
                  <a
                    href={passengerSms}
                    aria-label={`Message ${trip.passengerName}`}
                  >
                    <MessageCircle className="size-4" /> Message
                  </a>
                </Button>
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Trip Manager card */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Trip manager
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback>{initials(poster.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{poster.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {poster.role}
                  {poster.sub && ` · ${poster.sub}`}
                </div>
                {poster.phone && (
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {poster.phone}
                  </div>
                )}
              </div>
            </div>
            {poster.phone && (
              <div className="flex gap-2">
                <Button asChild className="flex-1" size="sm">
                  <a href={posterTel}>
                    <Phone className="size-4" /> Call manager
                  </a>
                </Button>
                <Button asChild className="flex-1" size="sm" variant="outline">
                  <a href={posterSms}>
                    <MessageCircle className="size-4" /> Message
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Driver notes */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <StickyNote className="size-3.5" /> Driver notes
            </div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Anything noteworthy about the pickup, the route, or the passenger…"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={saveNotes}
                disabled={notesDraft === (execution?.driverNotes ?? '')}
              >
                Save notes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Odometer photos */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Camera className="size-3.5" /> Odometer photos
            </div>

            <OdoBlock
              label="Start of trip"
              photo={execution?.startOdo}
              empty={started ? 'Trip started — add the odometer photo if you have it.' : 'Captured at pickup, before driving off.'}
              onAdd={started && !completed ? () => startInputRef.current?.click() : undefined}
            />
            <OdoBlock
              label="End of trip"
              photo={execution?.endOdo}
              empty="Captured at drop-off."
            />

            <div className="text-[10px] text-muted-foreground italic pt-1 border-t">
              Photos are stored locally on your device and synced to the trip
              record. Used to reconcile the actual distance billed.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hidden file inputs for both stages.
          `capture="environment"` is mobile-only — desktop browsers
          ignore it gracefully and just open the file picker. */}
      <input
        ref={startInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Capture start-of-trip odometer photo"
        title="Capture start-of-trip odometer photo"
        onChange={(e) => handlePhoto('start', e)}
      />
      <input
        ref={endInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Capture end-of-trip odometer photo"
        title="Capture end-of-trip odometer photo"
        onChange={(e) => handlePhoto('end', e)}
      />

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4 space-y-2">
        {!isMine ? (
          <Button variant="outline" disabled className="w-full">
            Not assigned to you
          </Button>
        ) : completed ? (
          <div className="flex items-center justify-center gap-2 px-3 py-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-sm">
            <CheckCircle2 className="size-4" /> Trip completed · {formatINR(tripApproxDriverCost(trip))}
          </div>
        ) : !started ? (
          otpEntryMode ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground text-center">
                Ask the passenger for the 6-digit OTP they received
                {' '}<span className="text-muted-foreground/70">(demo: 123456)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otpDraft}
                  onChange={(e) =>
                    setOtpDraft(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="••••••"
                  aria-label="Passenger OTP"
                  autoFocus
                  className="flex-1 h-12 rounded-lg border border-input bg-background text-center font-mono font-bold text-2xl tracking-[0.4em] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
                <Button
                  size="lg"
                  onClick={() => {
                    // Demo: accept the trip's generated OTP or the universal
                    // demo code 123456.
                    if (otpDraft !== overlay?.passengerOtp && otpDraft !== '123456') {
                      toast.error('Incorrect OTP — please ask the passenger again');
                      return;
                    }
                    setOtpEntryMode(false);
                    setOtpDraft('');
                    if (tripId) startTrip(tripId, undefined, notesDraft || undefined);
                    toast.success('Trip started — drive safe! 🚗');
                  }}
                  disabled={otpDraft.length !== 6}
                >
                  Verify & start
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOtpEntryMode(false);
                  setOtpDraft('');
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="full"
              size="lg"
              className="w-full"
              onClick={() => setOtpEntryMode(true)}
              disabled={pendingPhotoStage === 'start'}
            >
              {pendingPhotoStage === 'start' ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Processing photo…
                </>
              ) : (
                <>
                  <KeyRound className="size-5" /> Start trip · enter passenger OTP
                </>
              )}
            </Button>
          )
        ) : (
          <Button
            variant="full"
            size="lg"
            className="w-full"
            onClick={() => endInputRef.current?.click()}
            disabled={pendingPhotoStage === 'end'}
          >
            {pendingPhotoStage === 'end' ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Processing photo…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-5" /> Complete trip + capture odometer
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// =====================
// Sub-components
// =====================

function StatusBadge({
  started,
  completed,
}: {
  started: boolean;
  completed: boolean;
}) {
  if (completed) return <Badge variant="muted">Completed</Badge>;
  if (started) return <Badge variant="info">In progress</Badge>;
  return <Badge variant="success">Ready to start</Badge>;
}

function Step({
  done,
  label,
  hint,
}: {
  done: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          'size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
          done
            ? 'bg-emerald-500 text-white'
            : 'bg-gray-200 text-gray-500',
        )}
      >
        {done ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('font-semibold', !done && 'text-muted-foreground')}>
          {label}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </li>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5 [&_svg]:size-4 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

function OdoBlock({
  label,
  photo,
  empty,
  onAdd,
}: {
  label: string;
  photo?: { dataUrl: string; capturedAt: string; filename: string };
  empty: string;
  /** When set and there's no photo yet, render an "Add photo" affordance. */
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="size-16 rounded-lg overflow-hidden bg-gray-100 border border-input shrink-0">
        {photo ? (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img
            src={photo.dataUrl}
            alt={`${label} odometer photo`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Camera className="size-5 opacity-40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        {photo ? (
          <div className="text-xs text-muted-foreground">
            Captured{' '}
            {new Date(photo.capturedAt).toLocaleString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">{empty}</div>
        )}
        {!photo && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="mt-1 text-xs font-semibold text-primary hover:underline"
          >
            📷 Add photo
          </button>
        )}
      </div>
    </div>
  );
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

