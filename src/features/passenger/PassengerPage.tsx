import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  KeyRound,
  ArrowLeft,
  MapPin,
  Calendar,
  Phone,
  MessageCircle,
  Wallet,
  Star,
  Car,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useTrips } from '@/hooks/useTrips';
import {
  useTripStateStore,
  applyOverlay,
  findOverlayByOtp,
} from '@/stores/tripStateStore';
import {
  usePassengerReviewsStore,
  PASSENGER_REVIEW_TAGS,
  type PassengerReview,
} from '@/stores/passengerReviewsStore';
import { mockDrivers, mockManagers, mockUsers } from '@/data/mockData';
import { initials, formatINR, formatKm, cn } from '@/lib/utils';
import { tripDriverBata, tripExtrasPaidByPassenger } from '@/lib/tripDefaults';
import { toast } from 'sonner';

/**
 * Public Passenger Portal — no login.
 *
 * Flow:
 *  1. Passenger lands on /passenger and types their 6-digit OTP. Linked
 *     out-of-band by the trip manager via SMS/WhatsApp.
 *  2. We look up the trip by OTP from tripStateStore overlay.
 *  3. Show full trip details: driver (with rating + vehicle + Call/SMS),
 *     trip manager (with Call/SMS), pickup/destination/time, fare —
 *     fare gated on overlay.showFareToPassenger.
 *  4. After the trip completes, passenger can leave a review for the
 *     driver: ★ score, optional tags, optional comment.
 *
 * Anti-replay: each OTP can only be redeemed once for a review submission;
 * the trip-view side stays accessible (passenger can re-check their info).
 */
export function PassengerPage() {
  const navigate = useNavigate();
  const overlays = useTripStateStore((s) => s.overlays);
  const { data: rawTrips = [] } = useTrips();
  const submitReview = usePassengerReviewsStore((s) => s.submit);
  const markOtpUsed = usePassengerReviewsStore((s) => s.markOtpUsed);
  const reviewsByTrip = usePassengerReviewsStore((s) => s.byTrip);

  const [otpInput, setOtpInput] = useState('');
  const [verifiedTripId, setVerifiedTripId] = useState<string | null>(null);

  const verify = () => {
    const cleaned = otpInput.trim();
    if (cleaned.length !== 6) {
      toast.error('Enter the 6-digit OTP from your trip manager');
      return;
    }
    const found = findOverlayByOtp(cleaned, overlays);
    if (!found) {
      toast.error('OTP not recognised. Double-check with the trip manager.');
      return;
    }
    setVerifiedTripId(found.tripId);
    setOtpInput('');
    toast.success('Welcome — here are your trip details');
  };

  const trip = useMemo(() => {
    if (!verifiedTripId) return null;
    const raw = rawTrips.find((t) => t.id === verifiedTripId);
    if (!raw) return null;
    return applyOverlay(raw, overlays);
  }, [verifiedTripId, rawTrips, overlays]);

  const overlay = verifiedTripId ? overlays[verifiedTripId] : null;

  // === OTP gate ===
  if (!verifiedTripId || !trip) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col">
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close passenger portal"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="font-semibold">Passenger Portal</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 space-y-6 max-w-md mx-auto">
          <div className="size-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700">
            <KeyRound className="size-8" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Enter your trip OTP</h2>
            <p className="text-sm text-muted-foreground">
              Your trip manager shared a 6-digit code with you over SMS or
              WhatsApp. Type it in to view your trip details.
            </p>
          </div>

          <div className="w-full space-y-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otpInput}
              onChange={(e) =>
                setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="••••••"
              aria-label="Trip OTP"
              autoFocus
              className="w-full h-16 rounded-xl border border-input bg-white text-center font-mono font-bold text-3xl tracking-[0.4em] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            <Button
              variant="full"
              size="lg"
              className="w-full"
              onClick={verify}
              disabled={otpInput.length !== 6}
            >
              View my trip
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center space-y-1">
            <div className="flex items-center gap-1.5 justify-center">
              <ShieldCheck className="size-3.5" />
              Each OTP shows only one trip
            </div>
            <div>Lost your OTP? Ask the trip manager to share again.</div>
          </div>
        </div>
      </div>
    );
  }

  // === Trip view ===
  const driver = mockDrivers.find((d) => d.id === trip.assignedDriverId);
  const poster = (() => {
    const mgr = mockManagers.find((m) => m.userId === trip.postedByUserId);
    if (mgr) {
      return {
        name: mgr.fullName,
        phone: mgr.phone,
        sub: mgr.businessName,
      };
    }
    const u = mockUsers.find((x) => x.id === trip.postedByUserId);
    return {
      name: trip.postedByName ?? u?.displayName ?? 'Unknown',
      phone: u?.phone ?? '',
      sub: undefined as string | undefined,
    };
  })();

  const showFare = overlay?.showFareToPassenger ?? true;
  const tripCompleted = trip.status === 'completed';
  const existingReview = reviewsByTrip[trip.id];
  const driverPhone = driver?.phone ?? '';
  const driverTel = `tel:${driverPhone.replace(/[^\d+]/g, '')}`;
  const driverSms = `sms:${driverPhone.replace(/[^\d+]/g, '')}`;
  const posterTel = `tel:${poster.phone.replace(/[^\d+]/g, '')}`;
  const posterSms = `sms:${poster.phone.replace(/[^\d+]/g, '')}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setVerifiedTripId(null);
              setOtpInput('');
            }}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="font-semibold truncate">Your trip</h1>
        </div>
        <Badge variant={tripCompleted ? 'muted' : 'success'}>
          {tripCompleted ? 'Completed' : trip.status === 'in_progress' ? 'In progress' : 'Confirmed'}
        </Badge>
      </header>

      <div className="p-4 space-y-4">
        {/* Hello / Welcome */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Hello, {trip.passengerName.split(' ')[0]}!
            </div>
            <div className="text-lg font-bold leading-tight">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm pt-2">
              <Stat
                icon={<MapPin />}
                label="Distance"
                value={formatKm(trip.expectedDistanceKm)}
              />
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
                icon={<KeyRound />}
                label="Your OTP"
                value={overlay?.passengerOtp ?? '------'}
              />
            </div>
          </CardContent>
        </Card>

        {/* Driver card */}
        {driver ? (
          <Card>
            <CardContent className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Your driver
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="size-14">
                  <AvatarFallback className="text-base">
                    {initials(driver.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base truncate">
                    {driver.fullName}
                  </div>
                  {driver.ratingCount > 0 && (
                    <div className="flex items-center gap-1 text-amber-600 font-semibold text-sm">
                      <Star className="size-3.5 fill-amber-500 stroke-amber-500" />
                      {driver.ratingAvg.toFixed(1)}
                      <span className="text-muted-foreground font-normal text-xs">
                        · {driver.totalTripsCompleted} trips
                      </span>
                    </div>
                  )}
                  {driver.vehicles[0] && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {driver.vehicles[0].make} {driver.vehicles[0].model}{' '}
                      {driver.vehicles[0].year} ·{' '}
                      <span className="font-mono">
                        {driver.vehicles[0].registrationNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {driverPhone && (
                <div className="flex gap-2">
                  <Button asChild className="flex-1" size="sm">
                    <a href={driverTel} aria-label={`Call ${driver.fullName}`}>
                      <Phone className="size-4" /> Call driver
                    </a>
                  </Button>
                  <Button asChild className="flex-1" size="sm" variant="outline">
                    <a href={driverSms} aria-label={`Message ${driver.fullName}`}>
                      <MessageCircle className="size-4" /> Message
                    </a>
                  </Button>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground italic">
                Share your OTP with the driver only when they arrive — it
                confirms you're the right passenger.
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="text-sm text-amber-900">
              Driver hasn't been assigned to this trip yet. We'll show their
              details here as soon as the trip manager picks one.
            </CardContent>
          </Card>
        )}

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
                  {poster.sub ?? 'Trip Manager'}
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
                <Button asChild className="flex-1" size="sm" variant="outline">
                  <a href={posterTel}>
                    <Phone className="size-4" /> Call
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

        {/* Fare — gated on manager preference */}
        <Card
          className={cn(
            !showFare && 'border-gray-200 bg-gray-50',
          )}
        >
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Wallet className="size-3.5" /> Trip fare
            </div>
            {showFare ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Fare ({formatKm(trip.expectedDistanceKm)} × ₹{trip.ratePerKm}/km)
                  </span>
                  <span className="font-semibold">{formatINR(trip.totalFare)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">+ Driver bata</span>
                  <span className="font-semibold">+ {formatINR(tripDriverBata(trip))}</span>
                </div>
                <div className="flex items-center justify-between pt-1 mt-1 border-t">
                  <span className="font-bold">Total to driver</span>
                  <span className="font-bold text-2xl text-emerald-700">
                    {formatINR(trip.totalFare + tripDriverBata(trip))}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  🧳 Packing, toll & permit:{' '}
                  {tripExtrasPaidByPassenger(trip) ? 'extra, paid by you' : 'included'}
                </div>
                <div className="text-[11px] text-muted-foreground italic pt-1 border-t">
                  Pay this directly to the driver at the end of the trip. Cash
                  or UPI accepted.
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold">
                  Fare handled separately
                </div>
                <div className="text-xs text-muted-foreground">
                  Your trip manager has chosen to handle payment directly. You
                  don't need to pay the driver.
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Review */}
        {driver && (
          <ReviewBlock
            tripId={trip.id}
            driverName={driver.fullName.split(' ')[0]}
            driverId={driver.id}
            existing={existingReview}
            tripCompleted={tripCompleted}
            onSubmit={(r) => {
              submitReview(r);
              if (overlay?.passengerOtp) markOtpUsed(overlay.passengerOtp, trip.id);
              toast.success('Thanks for the review!');
            }}
          />
        )}

        <div className="text-[11px] text-muted-foreground text-center italic pt-2">
          Need help? Call your trip manager — they're your support contact.
        </div>
      </div>
    </div>
  );
}

// =====================
// Sub-components
// =====================

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
        <div className="font-semibold text-sm truncate">{value}</div>
      </div>
    </div>
  );
}

function ReviewBlock({
  tripId,
  driverName,
  driverId,
  existing,
  tripCompleted,
  onSubmit,
}: {
  tripId: string;
  driverName: string;
  driverId: string;
  existing?: PassengerReview;
  tripCompleted: boolean;
  onSubmit: (r: PassengerReview) => void;
}) {
  const [score, setScore] = useState<1 | 2 | 3 | 4 | 5>(existing?.score ?? 5);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [comment, setComment] = useState(existing?.comment ?? '');

  if (existing) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="size-4" />
            <span className="font-semibold text-sm">Thanks for your review!</span>
          </div>
          <div className="flex items-center gap-1 text-amber-600">
            {Array.from({ length: existing.score }).map((_, i) => (
              <Star key={i} className="size-4 fill-amber-500 stroke-amber-500" />
            ))}
          </div>
          {existing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {existing.tags.map((t) => (
                <Badge key={t} variant="success" className="text-[10px]">
                  ★ {t}
                </Badge>
              ))}
            </div>
          )}
          {existing.comment && (
            <p className="text-sm italic text-muted-foreground">"{existing.comment}"</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!tripCompleted) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          You can leave a review for {driverName} once your trip is completed.
        </CardContent>
      </Card>
    );
  }

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Rate your driver
        </div>
        <div className="flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n as 1 | 2 | 3 | 4 | 5)}
              aria-label={`${n} stars`}
              className="p-1"
            >
              <Star
                className={cn(
                  'size-9 transition-colors',
                  n <= score
                    ? 'fill-amber-500 stroke-amber-500'
                    : 'fill-transparent stroke-gray-300',
                )}
              />
            </button>
          ))}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
            Tags (optional)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PASSENGER_REVIEW_TAGS.map((t) => {
              const active = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                    active
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'border-border bg-white hover:border-primary/40',
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Comment (optional)
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={`Tell other passengers about your trip with ${driverName}…`}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>
        <Button
          variant="full"
          size="lg"
          className="w-full"
          onClick={() =>
            onSubmit({
              tripId,
              driverId,
              score,
              tags,
              comment: comment.trim(),
              createdAt: new Date().toISOString(),
            })
          }
        >
          Submit review
        </Button>
      </CardContent>
    </Card>
  );
}
