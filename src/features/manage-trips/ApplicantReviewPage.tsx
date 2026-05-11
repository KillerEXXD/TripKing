import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Star,
  CheckCircle2,
  Phone,
  XCircle,
  RefreshCcw,
  AlertTriangle,
  Calendar,
  Users,
  Car,
  Package,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  Share2,
} from 'lucide-react';
import { useTrip, useTripApplicants } from '@/hooks/useTrips';
import { useGoBack } from '@/hooks/useGoBack';
import { useTripStateStore } from '@/stores/tripStateStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { TripTracking } from '@/components/TripTracking';
import { initials, formatINR, formatKm, cn } from '@/lib/utils';
import {
  tripApproxDriverCost,
  tripDriverBata,
  tripExtrasPaidByPassenger,
} from '@/lib/tripDefaults';
import type { Trip, TripAcceptance } from '@/types';
import { toast } from 'sonner';

export function ApplicantReviewPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const goBack = useGoBack('/manager/posted-trips');
  const { data: trip } = useTrip(tripId);
  const { data: applicants = [] } = useTripApplicants(tripId);
  const [shareOpen, setShareOpen] = useState(false);

  const overlay = useTripStateStore((s) => (tripId ? s.overlays[tripId] : undefined));
  const assignDriver = useTripStateStore((s) => s.assignDriver);
  const cancelTrip = useTripStateStore((s) => s.cancelTrip);
  const setShowFareToPassenger = useTripStateStore(
    (s) => s.setShowFareToPassenger,
  );
  const setHidePassengerPhone = useTripStateStore(
    (s) => s.setHidePassengerPhone,
  );
  const regenerateOtp = useTripStateStore((s) => s.regenerateOtp);

  const tripStatus = overlay?.status ?? trip?.status;
  const assignedAcceptanceId = overlay?.assignedAcceptanceId;
  const isCancelled = tripStatus === 'cancelled';
  const isAssigned = tripStatus === 'assigned' || tripStatus === 'in_progress';

  const acceptances = useMemo(() => {
    if (!applicants.length) return [];
    if (!overlay?.acceptanceStatuses) return applicants;
    return applicants.map((a) => ({
      ...a,
      status: overlay.acceptanceStatuses![a.id] ?? a.status,
    }));
  }, [applicants, overlay]);

  const assigned = acceptances.find((a) => a.id === assignedAcceptanceId);
  const others = acceptances.filter((a) => a.id !== assignedAcceptanceId);

  const handleChoose = (a: TripAcceptance) => {
    if (!tripId) return;
    assignDriver(
      tripId,
      a.id,
      a.driverId,
      acceptances.map((x) => x.id),
    );
    toast.success(
      `${a.driver.fullName} chosen — other applicants notified`,
    );
  };

  const handleReplace = (a: TripAcceptance) => {
    if (!tripId) return;
    if (
      !confirm(
        `Replace assigned driver with ${a.driver.fullName}? The previous driver will be notified.`,
      )
    )
      return;
    assignDriver(
      tripId,
      a.id,
      a.driverId,
      acceptances.map((x) => x.id),
    );
    toast.success(
      `Trip reassigned to ${a.driver.fullName} — previous driver notified`,
    );
  };

  const handleCancel = () => {
    if (!tripId) return;
    const reason = prompt(
      'Cancel this trip? Optional reason (will be sent to applicants):',
      '',
    );
    if (reason === null) return;
    cancelTrip(tripId, reason ?? '');
    toast.success('Trip cancelled — all applicants notified');
    setTimeout(() => navigate('/manager/posted-trips?status=cancelled'), 800);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">Applicant Review</h1>
          {trip && (
            <p className="text-xs text-muted-foreground truncate">
              {trip.fromCity.name} → {trip.toCity.name} · {acceptances.length} applicants
            </p>
          )}
        </div>
        {trip && !isCancelled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            className="text-emerald-700 border-emerald-200 hover:border-emerald-300"
          >
            <Share2 className="size-3.5" /> Share
          </Button>
        )}
        {isCancelled && <Badge variant="destructive">Cancelled</Badge>}
        {isAssigned && <Badge variant="success">Assigned</Badge>}
      </header>

      <div className="p-4 space-y-4">
        {isCancelled && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-start gap-2">
              <XCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-red-900">
                  Trip cancelled
                </div>
                {overlay?.cancelReason && (
                  <div className="text-xs text-red-700 mt-0.5">
                    Reason: {overlay.cancelReason}
                  </div>
                )}
                <div className="text-xs text-red-700 mt-0.5">
                  All applicants have been notified.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full trip-posting details so the manager has all context here without
            having to navigate elsewhere. */}
        {trip && <TripSummaryCard trip={trip} />}

        {/* Live tracking — shown once the trip is underway. */}
        {trip && tripStatus === 'in_progress' && (
          <TripTracking trip={{ ...trip, status: 'in_progress' }} variant="full" />
        )}

        {/* Assigned-driver hero card */}
        {assigned && !isCancelled && (
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="size-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">
                  Assigned driver
                </span>
              </div>
              <ApplicantBlock
                a={assigned}
                emphasis
                onView={() => navigate(`/drivers/${assigned.driver.id}`)}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1">
                  <Phone className="size-3.5" /> Call driver
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(`/drivers/${assigned.driver.id}`)}
                >
                  View profile
                </Button>
              </div>
              {others.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  <div>
                    Driver unavailable? You can re-select from{' '}
                    <strong>{others.length} other applicant{others.length > 1 ? 's' : ''}</strong>{' '}
                    below — the previous driver will be notified.
                  </div>
                </div>
              )}

              {/* Passenger OTP — manager shares this with the passenger out
                  of band (SMS/WhatsApp). Passenger types it on /passenger
                  to view the trip + leave a review. */}
              {tripId && overlay?.passengerOtp && (
                <div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold flex items-center gap-1.5">
                      <KeyRound className="size-3.5" /> Passenger OTP
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm('Generate a fresh OTP? The previous one will stop working.')) return;
                        regenerateOtp(tripId);
                        toast.success('New OTP generated — share with the passenger');
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Regenerate
                    </button>
                  </div>
                  <div className="font-mono font-bold text-3xl tracking-[0.3em] text-center select-all py-1">
                    {overlay.passengerOtp}
                  </div>
                  <div className="text-[10px] text-muted-foreground italic">
                    Share with the passenger via SMS/WhatsApp. They'll enter it on the
                    Passenger Portal to view trip details + leave a review.
                  </div>

                  {/* Show-fare toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowFareToPassenger(tripId, !overlay.showFareToPassenger);
                      toast.success(
                        overlay.showFareToPassenger
                          ? 'Fare hidden from passenger'
                          : 'Fare visible to passenger',
                      );
                    }}
                    className={cn(
                      'w-full mt-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-colors',
                      overlay.showFareToPassenger
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                        : 'border-gray-200 bg-gray-50 text-gray-700',
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      {overlay.showFareToPassenger ? (
                        <>
                          <Eye className="size-3.5" /> Fare visible to passenger
                        </>
                      ) : (
                        <>
                          <EyeOff className="size-3.5" /> Fare hidden from passenger
                        </>
                      )}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                      Tap to toggle
                    </span>
                  </button>

                  {/* Hide-passenger-phone toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setHidePassengerPhone(tripId, !overlay.hidePassengerPhone);
                      toast.success(
                        overlay.hidePassengerPhone
                          ? 'Passenger phone visible to driver'
                          : 'Passenger phone hidden from driver',
                      );
                    }}
                    className={cn(
                      'w-full mt-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-colors',
                      overlay.hidePassengerPhone
                        ? 'border-amber-300 bg-amber-50/60 text-amber-900'
                        : 'border-gray-200 bg-gray-50 text-gray-700',
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      {overlay.hidePassengerPhone ? (
                        <>
                          <EyeOff className="size-3.5" /> Passenger phone hidden from driver
                        </>
                      ) : (
                        <>
                          <Eye className="size-3.5" /> Passenger phone visible to driver
                        </>
                      )}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                      Tap to toggle
                    </span>
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Other applicants section */}
        {others.length > 0 && !isCancelled && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {assigned ? 'Other applicants' : 'Applicants'}
              </h3>
              <Badge variant="muted">{others.length}</Badge>
            </div>
            <div className="space-y-2">
              {others.map((a) => (
                <Card key={a.id}>
                  <CardContent className="space-y-3">
                    <ApplicantBlock
                      a={a}
                      onView={() => navigate(`/drivers/${a.driver.id}`)}
                    />
                    <div className="flex gap-2 pt-2 border-t">
                      {assigned ? (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleReplace(a)}
                        >
                          <RefreshCcw className="size-3.5" /> Replace assigned with this driver
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleChoose(a)}
                        >
                          ✓ Choose this driver
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/drivers/${a.driver.id}`)}
                      >
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {acceptances.length === 0 && !isCancelled && (
          <Card className="text-center py-10">
            <CardContent className="space-y-2">
              <div className="font-semibold">No applicants yet</div>
              <div className="text-sm text-muted-foreground">
                Drivers matching your criteria will appear here as they apply.
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Sticky cancel-trip CTA — manager-side action */}
      {!isCancelled && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4">
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive border-destructive/30"
            onClick={handleCancel}
          >
            <XCircle className="size-4" /> Cancel posted trip
          </Button>
        </div>
      )}

      {trip && (
        <ShareTripModal
          trip={trip}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

function TripSummaryCard({ trip }: { trip: Trip }) {
  const commissionAmount = Math.round((trip.totalFare * trip.commissionPct) / 100);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Trip details
          </div>
          <Badge variant="muted" className="text-[10px]">
            Posted{' '}
            {new Date(trip.createdAt).toLocaleString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            })}
          </Badge>
        </div>

        {/* Route */}
        <div className="text-lg font-bold leading-tight">
          {trip.fromCity.name} → {trip.toCity.name}
        </div>

        {/* Quick stats grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
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
            icon={<Users />}
            label="Passengers"
            value={`${trip.passengerCount} pax · ${trip.seatsRequired} seats`}
          />
        </div>

        {/* Pricing */}
        <div className="rounded-lg border border-input bg-muted/40 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Rate</span>
            <span className="font-semibold">₹{trip.ratePerKm}/km</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total fare</span>
            <span className="font-semibold">{formatINR(trip.totalFare)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              − Commission ({trip.commissionPct}%)
            </span>
            <span className="font-semibold">− {formatINR(commissionAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">− GST</span>
            <span className="font-semibold">− {formatINR(trip.gstAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">+ Driver bata</span>
            <span className="font-semibold">+ {formatINR(tripDriverBata(trip))}</span>
          </div>
          <div className="flex items-center justify-between pt-1 mt-1 border-t border-input">
            <span className="font-bold text-emerald-900 text-sm">Driver gets (approx.)</span>
            <span className="font-bold text-emerald-900 text-base">
              {formatINR(tripApproxDriverCost(trip))}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground italic pt-1">
            🧳 Packing, toll & permit:{' '}
            {tripExtrasPaidByPassenger(trip) ? 'Extra — paid by passenger' : 'Included in fare'}
          </div>
        </div>

        {/* Passenger — gracefully handles empty fields (manager may have
            posted the trip before confirming the passenger). */}
        <div className="space-y-1.5 pt-2 border-t">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Passenger
          </div>
          {!trip.passengerName?.trim() && !trip.passengerPhone?.trim() ? (
            <div className="text-xs text-muted-foreground italic">
              Not added yet — add the passenger after a driver is assigned.
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <Avatar className="size-9">
                <AvatarFallback className="text-xs">
                  {initials(trip.passengerName || '?')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {trip.passengerName || 'Name not added'}
                </div>
                {trip.passengerPhone && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {trip.passengerPhone}
                  </div>
                )}
              </div>
              {trip.passengerPhone && (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`tel:${trip.passengerPhone.replace(/[^\d+]/g, '')}`}
                    aria-label={`Call ${trip.passengerName || 'passenger'}`}
                  >
                    <Phone className="size-3.5" />
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Optional fields */}
        {(trip.luggageNotes || trip.specialRequests) && (
          <div className="space-y-1.5 pt-2 border-t">
            {trip.luggageNotes && (
              <div className="flex items-start gap-2 text-xs">
                <Package className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Luggage: </span>
                  <span>{trip.luggageNotes}</span>
                </div>
              </div>
            )}
            {trip.specialRequests && (
              <div className="flex items-start gap-2 text-xs">
                <Sparkles className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Special: </span>
                  <span>{trip.specialRequests}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
        <div className="font-semibold text-sm truncate">{value}</div>
      </div>
    </div>
  );
}

function ApplicantBlock({
  a,
  emphasis,
  onView,
}: {
  a: TripAcceptance;
  emphasis?: boolean;
  onView: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onView}
      className="flex items-start gap-3 w-full text-left"
    >
      <Avatar className={emphasis ? 'size-14' : 'size-12'}>
        <AvatarFallback className={emphasis ? 'text-base' : 'text-sm'}>
          {initials(a.driver.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold truncate">{a.driver.fullName}</div>
            {a.driver.ratingCount > 0 ? (
              <div className="flex items-center gap-1 text-amber-600 text-sm font-semibold">
                <Star className="size-3.5 fill-amber-500 stroke-amber-500" />
                {a.driver.ratingAvg.toFixed(1)}
                <span className="text-muted-foreground font-normal text-xs">
                  · {a.driver.totalTripsCompleted} trips
                </span>
              </div>
            ) : (
              <Badge variant="info" className="text-[10px]">
                New driver · {a.driver.totalTripsCompleted} trips
              </Badge>
            )}
          </div>
          {a.driver.ratingAvg >= 4.8 && (
            <Badge variant="success" className="text-[10px] shrink-0">
              Top Rated
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 truncate">
          {a.vehicle.make} {a.vehicle.model} {a.vehicle.year} · {a.vehicle.seats}{' '}
          seats{a.vehicle.ac && ' · AC'}
        </div>
        {a.driver.topTags.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {a.driver.topTags.slice(0, 3).map((t) => (
              <Badge key={t} variant="success" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {a.applicantQuotedRatePerKm && (
          <Badge variant="warning" className="mt-1.5 text-[10px]">
            Counter-quote: ₹{a.applicantQuotedRatePerKm}/km
          </Badge>
        )}
        {a.applicantMessage && (
          <p className="text-xs italic text-muted-foreground mt-1.5">
            "{a.applicantMessage}"
          </p>
        )}
        <div className="flex items-center text-xs text-muted-foreground mt-1.5 gap-1">
          <MapPin className="size-3" /> From {a.driver.currentCity.name}
        </div>
      </div>
    </button>
  );
}
