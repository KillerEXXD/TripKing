import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Wallet,
  Users,
  Snowflake,
  Phone,
  Package,
  ArrowRight,
  Calendar,
  HandCoins,
  ClipboardList,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LocationSearchPanel,
  type LocationValue,
} from '@/components/location/LocationSearchPanel';
import { useAuth } from '@/contexts/AuthContext';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { useUserPostedTripsStore } from '@/stores/userPostedTripsStore';
import { mockCities } from '@/data/mockData';
import { cn, formatINR, formatKm, haversineKm } from '@/lib/utils';
import {
  DEFAULT_DRIVER_BATA,
  DEFAULT_DRIVER_INSTRUCTIONS,
} from '@/lib/tripDefaults';
import { useGoBack } from '@/hooks/useGoBack';
import type { CarType, Trip } from '@/types';
import { toast } from 'sonner';

const CAR_TYPES: CarType[] = [
  'Hatchback',
  'Sedan',
  'SUV',
  'Innova',
  'Tempo Traveller',
  'Mini Bus',
];

const DEFAULT_FROM: LocationValue = {
  name: mockCities[0]!.name,
  state: mockCities[0]!.state,
  lat: mockCities[0]!.lat,
  lng: mockCities[0]!.lng,
};

const DEFAULT_TO: LocationValue = {
  name: mockCities[1]!.name,
  state: mockCities[1]!.state,
  lat: mockCities[1]!.lat,
  lng: mockCities[1]!.lng,
};

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Post Trip — full commercial trip form.
 *
 * Open to both Trip Managers (primary) and approved Drivers (relay flow).
 * Mirrors the requirements doc fields end-to-end. Map-driven from/to so
 * downstream alert matching + driver radius search has lat/lng.
 *
 * Distance is auto-seeded via haversine (~bird-flight) when both ends are
 * picked, but stays editable so the manager can override with the actual
 * driving distance from their pricing sheet.
 */
export function PostTripPage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/home');
  const { user } = useAuth();
  const addUserTrip = useUserPostedTripsStore((s) => s.addTrip);

  const [from, setFrom] = useState<LocationValue>(DEFAULT_FROM);
  const [to, setTo] = useState<LocationValue>(DEFAULT_TO);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const startOfHour = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 4);
    return d;
  }, []);
  const [pickupAt, setPickupAt] = useState<string>(toLocalDatetime(startOfHour));

  const haversineSuggested = useMemo(
    () => Math.round(haversineKm(from.lat, from.lng, to.lat, to.lng) * 1.2), // ~road factor
    [from, to],
  );
  const [distanceKm, setDistanceKm] = useState<number>(haversineSuggested);
  const [distanceTouched, setDistanceTouched] = useState(false);
  // Re-seed distance when from/to changes IF the user hasn't manually overridden it
  useEffect(() => {
    if (!distanceTouched) setDistanceKm(haversineSuggested);
  }, [haversineSuggested, distanceTouched]);

  const [carType, setCarType] = useState<CarType>('Sedan');
  const [seats, setSeats] = useState<number>(4);
  const [acRequired, setAcRequired] = useState(true);

  const [ratePerKm, setRatePerKm] = useState<string>('15');
  const [commissionPct, setCommissionPct] = useState<string>('10');
  const [gstAmount, setGstAmount] = useState<string>('100');
  const [driverBata, setDriverBata] = useState<string>(String(DEFAULT_DRIVER_BATA));
  const [extrasPaidByPassenger, setExtrasPaidByPassenger] = useState<boolean>(true);
  const [driverInstructions, setDriverInstructions] = useState<string>(
    DEFAULT_DRIVER_INSTRUCTIONS,
  );

  const [paxName, setPaxName] = useState('');
  const [paxPhone, setPaxPhone] = useState('');
  const [paxCount, setPaxCount] = useState<number>(2);
  const [luggageNotes, setLuggageNotes] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [showFareToPassenger, setShowFareToPassenger] = useState<boolean>(true);
  const [hidePassengerPhone, setHidePassengerPhone] = useState<boolean>(false);

  // Synthetic trip object passed to the share modal after submit. The mock
  // service doesn't actually persist the trip, so we build the same shape
  // the share card expects from the form values.
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);

  // 2-step wizard: 1 = where & when, 2 = price & details (+ advanced).
  const [step, setStep] = useState<1 | 2>(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const goNext = () => {
    if (distanceKm <= 0) {
      toast.error('Set the trip distance');
      return;
    }
    if (new Date(pickupAt).getTime() < Date.now() - 60_000) {
      toast.error('Pickup time is in the past');
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0 });
  };

  // Live computation
  const rate = parseFloat(ratePerKm) || 0;
  const commission = parseFloat(commissionPct) || 0;
  const gst = parseFloat(gstAmount) || 0;
  const bata = Math.max(0, Math.round(parseFloat(driverBata) || 0));
  const totalFare = Math.round(distanceKm * rate);
  const commissionAmount = Math.round((totalFare * commission) / 100);
  // What the driver gets: base fare − commission − GST + bata (bata is paid
  // straight to the driver and does not attract commission/GST).
  const driverPayout = Math.max(0, totalFare - commissionAmount - gst) + bata;

  const submit = () => {
    if (distanceKm <= 0 || rate <= 0) {
      toast.error('Distance and rate must be greater than zero');
      return;
    }
    if (new Date(pickupAt).getTime() < Date.now() - 60_000) {
      toast.error('Pickup time is in the past');
      return;
    }
    // Passenger info (name + phone) is intentionally optional — managers
    // often post a route before they have a confirmed passenger. They can
    // add details after a driver is assigned.
    if (paxPhone.trim() && paxPhone.replace(/\D/g, '').length < 10) {
      toast.error('Phone number looks invalid');
      return;
    }

    toast.success('Trip posted — share it now to fill faster');

    // Build the new Trip. In production this object comes from the
    // trip-create endpoint; here we generate a short-ish id and persist
    // to userPostedTripsStore so:
    //   1. The poster's PostedTrips view shows it immediately.
    //   2. The trip-detail link from the share card resolves to a real
    //      trip on the same device. Other devices fall back to the
    //      URL-hash data the share card includes.
    const newTripId = `t-u-${Date.now().toString(36)}`;
    const newTrip: Trip = {
      id: newTripId,
      postedByUserId: user?.id ?? '',
      postedByRole: user?.role === 'driver' ? 'driver' : 'trip_manager',
      postedByName: user?.displayName ?? 'You',
      postedByPhone: user?.phone,
      fromCity: {
        id: 'live-from',
        name: from.name,
        state: from.state ?? '',
        lat: from.lat,
        lng: from.lng,
      },
      toCity: {
        id: 'live-to',
        name: to.name,
        state: to.state ?? '',
        lat: to.lat,
        lng: to.lng,
      },
      pickupDateTime: new Date(pickupAt).toISOString(),
      expectedDistanceKm: distanceKm,
      carTypeRequired: carType,
      seatsRequired: seats,
      acRequired,
      ratePerKm: rate,
      totalFare,
      commissionPct: commission,
      gstAmount: gst,
      driverBata: bata,
      extrasPaidByPassenger,
      driverInstructions: driverInstructions.trim() || undefined,
      driverPayout,
      passengerName: paxName,
      passengerPhone: paxPhone,
      passengerCount: paxCount,
      luggageNotes: luggageNotes || undefined,
      specialRequests: specialRequests || undefined,
      status: 'open',
      applicantCount: 0,
      createdAt: new Date().toISOString(),
    };
    addUserTrip(newTrip);
    setShareTrip(newTrip);
  };

  const closeShareAndNavigate = () => {
    setShareTrip(null);
    navigate('/manager/posted-trips?status=open');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (step === 2 ? setStep(1) : goBack())}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold leading-tight">
            {step === 1 ? 'Post a trip · where & when' : 'Post a trip · price & details'}
          </h1>
          <div className="text-[11px] text-muted-foreground">Step {step} of 2</div>
        </div>
      </header>
      <div className="bg-white border-b px-4 pb-2 flex gap-1.5">
        <div className={cn('h-1 flex-1 rounded-full', step >= 1 ? 'bg-primary' : 'bg-gray-200')} />
        <div className={cn('h-1 flex-1 rounded-full', step >= 2 ? 'bg-primary' : 'bg-gray-200')} />
      </div>

      <div className="p-4 space-y-4">
        {step === 1 && (
        <>
        {/* ROUTE */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Route
            </div>

            <LocationField
              label="From"
              value={from}
              open={fromOpen}
              onToggle={() => setFromOpen((v) => !v)}
              onPick={(loc) => {
                setFrom(loc);
                setFromOpen(false);
              }}
              onClose={() => setFromOpen(false)}
            />

            <div className="flex items-center justify-center text-muted-foreground py-1">
              <ArrowRight className="size-4" />
            </div>

            <LocationField
              label="To"
              value={to}
              open={toOpen}
              onToggle={() => setToOpen((v) => !v)}
              onPick={(loc) => {
                setTo(loc);
                setToOpen(false);
              }}
              onClose={() => setToOpen(false)}
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Distance (km)
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={distanceKm}
                  onChange={(e) => {
                    setDistanceTouched(true);
                    setDistanceKm(parseInt(e.target.value || '0', 10));
                  }}
                />
                {!distanceTouched && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    auto-suggested · edit to override
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                  <Calendar className="size-3" /> Pickup
                </div>
                <Input
                  type="datetime-local"
                  value={pickupAt}
                  onChange={(e) => setPickupAt(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VEHICLE */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Vehicle requirements
            </div>

            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
              {CAR_TYPES.map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setCarType(ct)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                    carType === ct
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-white hover:border-primary/40',
                  )}
                >
                  {ct}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                  <Users className="size-3" /> Seats
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={seats}
                  onChange={(e) => setSeats(parseInt(e.target.value || '0', 10))}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                  <Snowflake className="size-3" /> AC required
                </div>
                <div className="flex gap-1.5">
                  {[
                    { key: true, label: 'Yes' },
                    { key: false, label: 'No' },
                  ].map((opt) => (
                    <button
                      key={String(opt.key)}
                      type="button"
                      onClick={() => setAcRequired(opt.key)}
                      className={cn(
                        'flex-1 px-2 py-2 rounded-lg text-sm font-semibold border transition-colors',
                        acRequired === opt.key
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'border-border bg-white hover:border-primary/40',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </>
        )}

        {step === 2 && (
        <>
        {/* PRICING */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Pricing
            </div>

            <div className="grid grid-cols-2 gap-2">
              <RupeeInput
                label="Rate / km"
                value={ratePerKm}
                onChange={setRatePerKm}
              />
              <NumberInput
                label="Commission %"
                value={commissionPct}
                suffix="%"
                onChange={setCommissionPct}
              />
              <RupeeInput
                label="GST (flat)"
                value={gstAmount}
                onChange={setGstAmount}
              />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                  <HandCoins className="size-3" /> Driver bata
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    ₹
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={driverBata}
                    onChange={(e) => setDriverBata(e.target.value)}
                    className="pl-7"
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  paid straight to the driver
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Total fare
              </div>
              <div className="px-3 py-2 rounded-lg border border-input bg-muted text-sm font-bold">
                {formatINR(totalFare)}
              </div>
            </div>

            {/* Packing / toll / permit */}
            <button
              type="button"
              onClick={() => setExtrasPaidByPassenger((v) => !v)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left text-sm transition-colors',
                extrasPaidByPassenger
                  ? 'border-amber-300 bg-amber-50/60'
                  : 'border-border bg-white hover:border-primary/40',
              )}
            >
              <span
                className={cn(
                  'size-5 rounded border-2 flex items-center justify-center shrink-0 text-xs font-bold',
                  extrasPaidByPassenger
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'border-gray-300 text-transparent',
                )}
              >
                ✓
              </span>
              <span className="font-medium">
                Packing, toll &amp; permit — extra, paid by passenger
              </span>
            </button>

            {/* Live payout preview */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total fare</span>
                <span className="font-semibold">{formatINR(totalFare)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  − Commission ({commission}%)
                </span>
                <span className="font-semibold">− {formatINR(commissionAmount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">− GST</span>
                <span className="font-semibold">− {formatINR(gst)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">+ Driver bata</span>
                <span className="font-semibold">+ {formatINR(bata)}</span>
              </div>
              <div className="flex justify-between pt-1 mt-1 border-t border-emerald-200">
                <span className="font-bold text-emerald-900">Driver gets</span>
                <span className="font-bold text-emerald-900 text-lg">
                  {formatINR(driverPayout)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DRIVER INSTRUCTIONS */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ClipboardList className="size-3.5" /> Driver instructions
            </div>
            <div className="text-[11px] text-muted-foreground -mt-1">
              Pre-filled — edit freely. Drivers see these when they open the trip.
            </div>
            <textarea
              value={driverInstructions}
              onChange={(e) => setDriverInstructions(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              placeholder={'One instruction per line'}
            />
          </CardContent>
        </Card>

        {/* ADVANCED (optional) — passenger details + privacy */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full rounded-xl border border-dashed bg-white py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          {showAdvanced ? 'Hide advanced options ▲' : 'Advanced options · passenger, privacy (optional) ▼'}
        </button>

        {showAdvanced && (
        <>
        {/* PASSENGER — optional */}
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Passenger details
              </div>
              <Badge variant="muted" className="text-[10px]">
                Optional
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground -mt-1">
              You can add the passenger after assigning a driver. Leave blank
              if not confirmed yet.
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Name
              </div>
              <Input
                value={paxName}
                onChange={(e) => setPaxName(e.target.value)}
                placeholder="e.g. A. Suresh"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                  <Phone className="size-3" /> Phone
                </div>
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={paxPhone}
                  onChange={(e) => setPaxPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                  <Users className="size-3" /> Pax count
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={seats}
                  value={paxCount}
                  onChange={(e) => setPaxCount(parseInt(e.target.value || '0', 10))}
                />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                <Package className="size-3" /> Luggage
              </div>
              <Input
                value={luggageNotes}
                onChange={(e) => setLuggageNotes(e.target.value)}
                placeholder='e.g. "2 medium bags + 1 stroller"'
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Special requests
              </div>
              <Input
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder='e.g. "Pickup from Gate 2"'
              />
            </div>
          </CardContent>
        </Card>

        {/* PRIVACY TOGGLES */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Privacy
            </div>

            <PrivacyToggle
              on={showFareToPassenger}
              onToggle={() => setShowFareToPassenger((v) => !v)}
              title="Show fare to passenger"
              hint="When the passenger enters their OTP, they'll see the trip fare they owe the driver. Turn off if you collect payment yourself."
              tone="emerald"
            />

            <PrivacyToggle
              on={hidePassengerPhone}
              onToggle={() => setHidePassengerPhone((v) => !v)}
              title="Hide passenger phone from driver"
              hint="Driver sees the passenger name only. Use when you want all pre-trip contact to flow through you. The passenger always sees the driver's phone."
              tone="amber"
            />
          </CardContent>
        </Card>
        </>
        )}

        {/* SUMMARY */}
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs flex items-start gap-2">
          <MapPin className="size-4 text-blue-700 mt-0.5 shrink-0" />
          <div className="text-blue-900">
            On publish, alerts matching <strong>{from.name} → {to.name}</strong>{' '}
            within their saved radius will fire push notifications. Drivers
            currently free in {from.name} will see this trip in their feed.
          </div>
        </div>
        </>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4 space-y-2">
        {step === 1 ? (
          <>
            <div className="text-xs text-muted-foreground px-1 truncate">
              {from.name} → {to.name} · {formatKm(distanceKm)} · {carType}
              {acRequired && ' · AC'}
            </div>
            <Button variant="full" size="lg" className="w-full" onClick={goNext}>
              Next: price &amp; details →
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs px-1">
              <Badge variant="outline">
                {carType}
                {acRequired && ' · AC'} · {seats} seats
              </Badge>
              <span className="text-muted-foreground">
                Driver gets:{' '}
                <strong className="text-foreground">{formatINR(driverPayout)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                variant="full"
                size="lg"
                className="flex-[2]"
                onClick={submit}
              >
                POST TRIP
              </Button>
            </div>
          </>
        )}
      </div>

      {shareTrip && (
        <ShareTripModal
          trip={shareTrip}
          open={shareTrip !== null}
          onClose={closeShareAndNavigate}
        />
      )}
    </div>
  );
}

// =====================
// Sub-components
// =====================

function LocationField({
  label,
  value,
  open,
  onToggle,
  onPick,
  onClose,
}: {
  label: string;
  value: LocationValue;
  open: boolean;
  onToggle: () => void;
  onPick: (loc: LocationValue) => void;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-start gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-input hover:border-primary/40 transition-colors"
      >
        <MapPin className="size-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{value.name}</div>
          {value.displayName && (
            <div className="text-xs text-muted-foreground truncate">
              {value.displayName}
            </div>
          )}
        </div>
        <span className="text-xs text-primary font-semibold self-center shrink-0">
          Change
        </span>
      </button>
      {open && (
        <div className="mt-2">
          <LocationSearchPanel
            title={`Set "${label}" location`}
            onPick={onPick}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}

function PrivacyToggle({
  on,
  onToggle,
  title,
  hint,
  tone,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  hint: string;
  tone: 'emerald' | 'amber';
}) {
  const accent =
    tone === 'emerald'
      ? on
        ? 'border-emerald-200 bg-emerald-50/50'
        : 'border-border bg-white'
      : on
        ? 'border-amber-300 bg-amber-50/60'
        : 'border-border bg-white';
  const dot =
    tone === 'emerald'
      ? on
        ? 'border-emerald-500 bg-emerald-500 text-white'
        : 'border-gray-300 text-gray-400'
      : on
        ? 'border-amber-500 bg-amber-500 text-white'
        : 'border-gray-300 text-gray-400';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left',
        accent,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div
        className={cn(
          'shrink-0 mt-0.5 size-10 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors',
          dot,
        )}
      >
        {on ? 'ON' : 'OFF'}
      </div>
    </button>
  );
}

function RupeeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
        <Wallet className="size-3" /> {label}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
          ₹
        </span>
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-7"
        />
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  suffix: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </div>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-8"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
          {suffix}
        </span>
      </div>
    </div>
  );
}

// Note: formatKm is imported from utils — ensure it's referenced if needed elsewhere
void formatKm;
