import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, ChevronDown, ChevronRight, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePostTrip } from '@/hooks/useTrips';
import { useMyAgent, useMyDriver } from '@/hooks/useDrivers';
import { useLookupPassengerByPhone, isLookupablePhone } from '@/hooks/usePassengers';
import { carTypeHooks, cityHooks, useAppSettings } from '@/hooks/useAdminConfig';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { KycGateNotice } from '@/components/driver';
import { PlacePinField } from '@/components/location/PlacePinField';
import { TripTypeTabs } from '@/components/trip/TripTypeTabs';
import { WaypointEditor, type WaypointDraft } from '@/components/trip/WaypointEditor';
import { Button, Card, Input } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { cn, formatINR, formatShortDate, haversineKm } from '@/lib/utils';
import type { Place, PostTripInput, Trip, TripType, WaypointInput } from '@/types';

interface PostTripForm {
  fromCityId: string;
  toCityId: string;
  pickupAt: string;
  expectedDistanceKm: number;
  carTypeId: string;
  seatsRequired: number;
  acRequired: boolean;
  ratePerKm: number;
  driverBata: number;
  extrasPaidByPassenger: boolean;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageNotes: string;
  specialRequests: string;
  driverInstructions: string;
  showFareToPassenger: boolean;
  hidePassengerPhone: boolean;
}

const DEFAULTS: PostTripForm = {
  fromCityId: '',
  toCityId: '',
  pickupAt: '',
  expectedDistanceKm: 0,
  carTypeId: '',
  seatsRequired: 4,
  acRequired: true,
  ratePerKm: 0,
  driverBata: 0,
  extrasPaidByPassenger: true,
  passengerName: '',
  passengerPhone: '',
  passengerCount: 1,
  luggageNotes: '',
  specialRequests: '',
  driverInstructions: '',
  showFareToPassenger: true,
  hidePassengerPhone: true,
};

const STEP1_FIELDS = ['fromCityId', 'toCityId', 'pickupAt', 'expectedDistanceKm', 'carTypeId', 'seatsRequired', 'acRequired'] as const;
const selectClass = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-base';
const sectionLabel = 'text-[11px] font-semibold uppercase tracking-wide text-secondary';
/** Road routes run longer than the crow-flies line — a rough multiplier so the auto-estimate isn't an under-count. */
const ROAD_DISTANCE_FACTOR = 1.3;

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-secondary">{hint}</span> : null}
      {error ? <span className="block text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

/**
 * `/trips/new` — post a trip, as a 2-step wizard mirroring the prototype:
 *   Step 1 · "where & when" — route (from / to cities, distance, pickup time)
 *            + vehicle requirements (car type, seats, AC).
 *   Step 2 · "price & details" — rate / bata (total fare = distance × rate;
 *            commission, GST and the driver payout are computed server-side),
 *            passenger details, visibility.
 * Dropdowns + the bata default come from `useAdminConfig`. On success the new
 * trip's share card opens, then we go to the trip.
 */
export function PostTripPage() {
  const navigate = useNavigate();
  const effectiveRole = useEffectiveRole();
  const isDriver = effectiveRole === 'driver';
  const myDriverQuery = useMyDriver(isDriver);
  const myAgentQuery = useMyAgent(!isDriver);
  const myKycStatus = (isDriver ? myDriverQuery.data?.kycStatus : myAgentQuery.data?.kycStatus) ?? undefined;
  const postTrip = usePostTrip();
  const citiesQuery = cityHooks.useList();
  const carTypesQuery = carTypeHooks.useList();
  const appSettings = useAppSettings();
  const [step, setStep] = useState<1 | 2>(1);
  const [postedTrip, setPostedTrip] = useState<Trip | null>(null);
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  // ── trip-type state (migration 024) ────────────────────────────────────────
  const [tripType, setTripType] = useState<TripType>('one_way');
  const [expectedEndAt, setExpectedEndAt] = useState<string>('');     // datetime-local; required for round_trip + multi_way
  const [waypoints, setWaypoints] = useState<WaypointDraft[]>([]);    // multi_way destinations only
  const [returnToStart, setReturnToStart] = useState<boolean>(false); // multi_way only — appends origin as final waypoint
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [passengerSectionOpen, setPassengerSectionOpen] = useState(false);
  const passengerSectionRef = useRef<HTMLDivElement>(null);

  const { register, handleSubmit, watch, setValue, getValues, trigger, formState } = useForm<PostTripForm>({ defaultValues: DEFAULTS });
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    const s = appSettings.data;
    if (!s) return;
    const cur = getValues();
    if (!cur.driverBata) setValue('driverBata', s.defaultDriverBata);
    if (!cur.driverInstructions && s.defaultDriverInstructions) setValue('driverInstructions', s.defaultDriverInstructions);
  }, [appSettings.data, getValues, setValue]);

  const [fromCityId, toCityId, distanceWatch, carTypeId, acRequired, rateWatch, passengerPhoneWatch, passengerNameWatch, hidePassengerPhoneWatch] = watch(['fromCityId', 'toCityId', 'expectedDistanceKm', 'carTypeId', 'acRequired', 'ratePerKm', 'passengerPhone', 'passengerName', 'hidePassengerPhone']);
  const distance = Number(distanceWatch) || 0;
  const rate = Number(rateWatch) || 0;
  const totalFare = distance > 0 && rate > 0 ? Math.round(distance * rate) : 0;
  const cityName = (id: string) => citiesQuery.data?.find((c) => c.id === id)?.name;
  const carTypeName = (id: string) => carTypesQuery.data?.find((c) => c.id === id)?.label;

  // The expected distance is computed from the picked route (the curated city's centre, or the
  // pinned exact spot when one is set) — the poster never types it. A short delay debounces rapid
  // changes and lets the "calculating…" indicator paint.
  const citiesData = citiesQuery.data;
  useEffect(() => {
    const coordsOf = (id: string) => citiesData?.find((c) => c.id === id);
    const a = fromPlace ?? coordsOf(fromCityId);
    const b = toPlace ?? coordsOf(toCityId);
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng) || (a.lat === b.lat && a.lng === b.lng)) {
      setDistanceCalculating(false);
      return;
    }
    setDistanceCalculating(true);
    const t = setTimeout(() => {
      setValue('expectedDistanceKm', Math.max(1, Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * ROAD_DISTANCE_FACTOR)), { shouldValidate: true });
      setDistanceCalculating(false);
    }, 450);
    return () => clearTimeout(t);
  }, [fromCityId, toCityId, fromPlace, toPlace, citiesData, setValue]);

  // Look the passenger up by phone (debounced) once it's "complete" — prefill the name from the
  // directory when we have a hit and the name field is still empty (never clobber a typed name).
  const [debouncedPhone, setDebouncedPhone] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPhone((passengerPhoneWatch ?? '').trim()), 350);
    return () => clearTimeout(t);
  }, [passengerPhoneWatch]);
  const phoneLookupable = isLookupablePhone(debouncedPhone);
  const passengerLookup = useLookupPassengerByPhone(debouncedPhone);
  const knownPassenger = phoneLookupable && !passengerLookup.isFetching ? (passengerLookup.data ?? null) : null;
  useEffect(() => {
    const p = passengerLookup.data;
    if (p && !getValues('passengerName').trim()) setValue('passengerName', p.name, { shouldValidate: true });
  }, [passengerLookup.data, getValues, setValue]);

  async function onNext() {
    // Multi-way uses the WaypointEditor instead of `toCityId`; skip that field's validation.
    const fields = tripType === 'multi_way'
      ? STEP1_FIELDS.filter((f) => f !== 'toCityId')
      : [...STEP1_FIELDS];
    const ok = await trigger(fields as readonly (keyof PostTripForm)[]);
    if (!ok) return;
    if (tripType !== 'multi_way' && getValues('fromCityId') === getValues('toCityId')) {
      toast.error(tripType === 'round_trip' ? 'Starting city and turnaround must be different' : 'Pickup and drop-off cities must be different');
      return;
    }
    if (tripType === 'multi_way') {
      if (waypoints.length < 2 || waypoints.some((w) => !w.cityId)) {
        toast.error('Add at least 2 destinations (each with a city)');
        return;
      }
    }
    if (tripType !== 'one_way' && !expectedEndAt) {
      toast.error('Set when the trip ends');
      return;
    }
    setStep(2);
  }

  async function onSubmit(values: PostTripForm) {
    // One-way + round-trip use from/to fields and they must differ.
    if (tripType !== 'multi_way' && values.fromCityId === values.toCityId) {
      toast.error(tripType === 'round_trip' ? 'Starting city and turnaround must be different' : 'Pickup and drop-off cities must be different');
      setStep(1);
      return;
    }
    // Multi-way needs ≥2 destinations, each with a city.
    if (tripType === 'multi_way') {
      const bad = waypoints.findIndex((w) => !w.cityId);
      if (waypoints.length < 2) { toast.error('Multi-way trips need at least 2 destinations'); setStep(1); return; }
      if (bad >= 0) { toast.error(`Destination ${bad + 1} needs a city`); setStep(1); return; }
    }
    // Build a waypoints array for the server only when the trip is round-trip or multi-way;
    // one-way keeps today's body (the server synthesises a 2-waypoint plan).
    const pickupIso = new Date(values.pickupAt).toISOString();
    const endIso = expectedEndAt ? new Date(expectedEndAt).toISOString() : undefined;
    let waypointInputs: WaypointInput[] | undefined;
    if (tripType === 'round_trip') {
      waypointInputs = [
        { cityId: values.fromCityId, placeId: fromPlace?.id },
        { cityId: values.toCityId, placeId: toPlace?.id, arriveAt: pickupIso, waitMinutes: 0, isDestination: true },
        { cityId: values.fromCityId, placeId: fromPlace?.id, arriveAt: endIso, waitMinutes: 0, isDestination: true },
      ];
    } else if (tripType === 'multi_way') {
      const rows: WaypointInput[] = waypoints.map((w) => ({
        cityId: w.cityId,
        arriveAt: w.arriveAt ? new Date(w.arriveAt).toISOString() : undefined,
        waitMinutes: w.waitMinutes,
        isDestination: true,
        notes: w.notes.trim() || undefined,
      }));
      const list: WaypointInput[] = [{ cityId: values.fromCityId, placeId: fromPlace?.id }, ...rows];
      if (returnToStart) list.push({ cityId: values.fromCityId, placeId: fromPlace?.id, arriveAt: endIso, waitMinutes: 0, isDestination: true });
      waypointInputs = list;
    }
    const input: PostTripInput = {
      tripType: tripType === 'one_way' ? undefined : tripType,
      waypoints: waypointInputs,
      expectedEndAt: endIso,
      fromCityId: values.fromCityId,
      toCityId: tripType === 'multi_way' ? (returnToStart ? values.fromCityId : (waypoints[waypoints.length - 1]?.cityId ?? '')) : values.toCityId,
      fromPlaceId: fromPlace?.id,
      toPlaceId: toPlace?.id,
      pickupAt: pickupIso,
      expectedDistanceKm: Number(values.expectedDistanceKm),
      carTypeId: values.carTypeId,
      seatsRequired: Number(values.seatsRequired),
      acRequired: values.acRequired,
      ratePerKm: Number(values.ratePerKm),
      totalFare,
      commissionPct: appSettings.data?.defaultCommissionPct ?? 0,
      gstAmount: 0,
      driverBata: Math.max(0, Math.round(Number(values.driverBata) || 0)),
      extrasPaidByPassenger: values.extrasPaidByPassenger,
      driverInstructions: values.driverInstructions.trim() || undefined,
      passengerName: passengerSectionOpen ? values.passengerName.trim() : '',
      passengerPhone: passengerSectionOpen ? values.passengerPhone.trim() : '',
      passengerCount: Number(values.passengerCount),
      luggageNotes: passengerSectionOpen ? (values.luggageNotes.trim() || undefined) : undefined,
      specialRequests: passengerSectionOpen ? (values.specialRequests.trim() || undefined) : undefined,
      showFareToPassenger: values.showFareToPassenger,
      hidePassengerPhone: values.hidePassengerPhone,
    };
    try {
      const trip = await postTrip.mutateAsync(input);
      toast.success('Trip posted — share it with drivers');
      setPostedTrip(trip);
    } catch {
      toast.error("Couldn't post the trip — try again.");
    }
  }

  const kycQueryPending = isDriver ? myDriverQuery.isPending : myAgentQuery.isPending;
  if (citiesQuery.isPending || carTypesQuery.isPending || kycQueryPending) {
    return (
      <div className="mx-auto max-w-md p-4">
        <h1 className="mb-3 text-xl font-bold">Post a trip</h1>
        <LoadingSkeleton rows={6} />
      </div>
    );
  }
  if (citiesQuery.isError || carTypesQuery.isError) {
    return (
      <div className="mx-auto max-w-md p-4">
        <h1 className="mb-3 text-xl font-bold">Post a trip</h1>
        <ErrorState title="Couldn't load the form" message="We need the city + car-type lists to post a trip." onRetry={() => { void citiesQuery.refetch(); void carTypesQuery.refetch(); }} />
      </div>
    );
  }

  if (myKycStatus && myKycStatus !== 'approved') {
    return (
      <div className="mx-auto max-w-md p-4">
        <button type="button" onClick={() => navigate('/')} className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
        <KycGateNotice heading="Get verified to post a trip" body="Once your account is verified you can post commercial trips and assign drivers. Your profile has a checklist that walks you through it." />
      </div>
    );
  }

  const cities = citiesQuery.data ?? [];
  const carTypes = (carTypesQuery.data ?? []).filter((c) => c.isActive);
  const submitting = isSubmitting || postTrip.isPending;
  const multiWayReady = waypoints.length >= 2 && waypoints.every((w) => !!w.cityId);
  const routeReady = tripType === 'multi_way'
    ? !!fromCityId && multiWayReady
    : !!fromCityId && !!toCityId && fromCityId !== toCityId;
  const endTimeReady = tripType === 'one_way' || !!expectedEndAt;
  const step1Ready = routeReady && !!getValues('pickupAt') && endTimeReady && distance >= 1 && !distanceCalculating && !!carTypeId && Number(getValues('seatsRequired')) >= 1;
  const summary = [cityName(fromCityId) && cityName(toCityId) ? `${cityName(fromCityId)} → ${cityName(toCityId)}` : null, distance > 0 ? `${distance} km` : null, carTypeName(carTypeId) ?? null, acRequired ? 'AC' : null].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button type="button" aria-label="Back" onClick={() => (step === 1 ? navigate('/') : setStep(1))} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Post a trip · {step === 1 ? 'where & when' : 'price & details'}</h1>
            <div className="text-xs text-secondary">Step {step} of 2</div>
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: step === 1 ? '50%' : '100%' }} />
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="flex-1 space-y-3 p-4 pb-28">
        {step === 1 ? (
          <>
            <TripTypeTabs value={tripType} onChange={setTripType} />
            <Card className="gap-3">
              <div className={sectionLabel}>
                {tripType === 'one_way' ? 'Route & schedule' : tripType === 'round_trip' ? 'Round-trip plan' : 'Multi-way itinerary'}
              </div>
              <div className="space-y-1.5">
                <Field label={tripType === 'one_way' ? 'From (pickup city)' : 'Trip starts from (city)'} error={errors.fromCityId?.message}>
                  <select className={selectClass} {...register('fromCityId', { required: 'Pick a starting city' })}>
                    <option value="">Select a city</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <PlacePinField value={fromPlace} onChange={setFromPlace} pinLabel="Pin the exact pickup point" pickerTitle="Pickup location" />
              </div>
              {tripType !== 'multi_way' ? (
                <div className="space-y-1.5">
                  <Field label={tripType === 'round_trip' ? 'Turnaround city' : 'To (drop-off city)'} error={errors.toCityId?.message}>
                    <select className={selectClass} {...register('toCityId', { required: 'Pick a destination city' })}>
                      <option value="">Select a city</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                  <PlacePinField value={toPlace} onChange={setToPlace} pinLabel="Pin the exact drop-off point" pickerTitle="Drop-off location" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Destinations (in order)</div>
                  <WaypointEditor
                    value={waypoints}
                    onChange={setWaypoints}
                    cities={cities}
                    rowLabel="Destination"
                    minRows={0}
                    addLabel="Add destination"
                  />
                  <label className="mt-1 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={returnToStart}
                      onChange={(e) => setReturnToStart(e.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    Return to start (the trip ends back at the origin)
                  </label>
                </div>
              )}
              <Field label={tripType === 'one_way' ? 'Pickup date & time' : 'Trip starts (date & time)'} error={errors.pickupAt?.message}>
                <Input type="datetime-local" {...register('pickupAt', { required: 'Set the start time', validate: (v) => (!!v && new Date(v).getTime() > Date.now()) || 'Start time must be in the future' })} />
              </Field>
              {tripType !== 'one_way' ? (
                <Field label="Trip ends (date & time)" hint={tripType === 'round_trip' ? 'When the driver is back at the start city.' : 'Auto-fills from the last destination — you can override.'}>
                  <Input
                    type="datetime-local"
                    value={expectedEndAt}
                    onChange={(e) => setExpectedEndAt(e.target.value)}
                  />
                </Field>
              ) : null}
              <Field label="Expected distance (km)" error={errors.expectedDistanceKm?.message} hint="Worked out from the route — you don't need to enter it">
                <div className="relative">
                  <Input
                    type="number"
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    inputMode="numeric"
                    className={cn('bg-muted/60', distanceCalculating && 'text-transparent')}
                    {...register('expectedDistanceKm', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1) || 'Pick the pickup & drop-off points so we can work out the distance' })}
                  />
                  {distanceCalculating ? (
                    <span className="pointer-events-none absolute inset-0 flex items-center gap-1.5 px-3 text-sm text-secondary" role="status">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Calculating route…
                    </span>
                  ) : null}
                </div>
              </Field>
            </Card>

            <Card className="gap-3">
              <div className={sectionLabel}>Vehicle requirements</div>
              <div className="space-y-1">
                <span className="text-sm font-medium">Car type required</span>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {carTypes.map((ct) => (
                    <button key={ct.id} type="button" onClick={() => setValue('carTypeId', ct.id, { shouldValidate: true })} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors', carTypeId === ct.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-white hover:border-primary/40')}>
                      {ct.label}
                    </button>
                  ))}
                </div>
                <input type="hidden" {...register('carTypeId', { required: 'Pick a car type' })} />
                {errors.carTypeId ? <span className="block text-xs text-red-700">{errors.carTypeId.message}</span> : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Seats" error={errors.seatsRequired?.message}>
                  <Input type="number" min={1} max={50} step={1} inputMode="numeric" {...register('seatsRequired', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1 && v <= 50) || '1–50 seats' })} />
                </Field>
                <div className="space-y-1">
                  <span className="text-sm font-medium">AC required</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setValue('acRequired', true)} className={cn('h-11 flex-1 rounded-lg border text-sm font-semibold', acRequired ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-input bg-white')}>Yes</button>
                    <button type="button" onClick={() => setValue('acRequired', false)} className={cn('h-11 flex-1 rounded-lg border text-sm font-semibold', !acRequired ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-input bg-white')}>No</button>
                  </div>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
            <Card className="gap-3">
              <div className={sectionLabel}>Pricing</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rate per km (₹)" error={errors.ratePerKm?.message}>
                  <Input type="number" min={1} step={1} inputMode="numeric" {...register('ratePerKm', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1) || 'Enter a rate per km' })} />
                </Field>
                <Field label="Driver bata (₹)" error={errors.driverBata?.message} hint="Paid straight to the driver">
                  <Input type="number" min={0} step={1} inputMode="numeric" {...register('driverBata', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 0) || 'Cannot be negative' })} />
                </Field>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-secondary">Total fare ({distance > 0 ? distance : '—'} km × {formatINR(rate)}/km)</span>
                  <span className="font-bold">{totalFare > 0 ? formatINR(totalFare) : '—'}</span>
                </div>
                <p className="mt-1 text-xs text-secondary">Platform commission, GST and the driver payout are calculated by TripKing — you&apos;ll see the final payout on the trip.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" {...register('extrasPaidByPassenger')} /> Packing / toll / permit extras paid by the passenger
              </label>
            </Card>

            {/* Passenger section — collapsed by default; details can be added later after driver is assigned */}
            <Card className="gap-0 overflow-hidden p-0">
              <button
                type="button"
                aria-expanded={passengerSectionOpen}
                onClick={() => {
                  setPassengerSectionOpen((v) => !v);
                  if (!passengerSectionOpen) setTimeout(() => passengerSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 100);
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <div className={sectionLabel}>Passenger details</div>
                  <div className="text-xs text-secondary">{passengerSectionOpen ? 'Tap to collapse' : 'Optional — you can add these after assigning a driver'}</div>
                </div>
                {passengerSectionOpen ? <ChevronDown className="size-4 text-secondary" aria-hidden /> : <ChevronRight className="size-4 text-secondary" aria-hidden />}
              </button>

              {passengerSectionOpen ? (
                <div ref={passengerSectionRef} className="space-y-3 border-t px-4 pb-4 pt-3">
                  <Field label="Passenger name" error={errors.passengerName?.message}>
                    <Input {...register('passengerName')} placeholder="Full name" />
                  </Field>
                  {phoneLookupable ? (
                    <div className="-mt-1.5 text-xs">
                      {passengerLookup.isFetching ? (
                        <span className="flex items-center gap-1.5 text-secondary" role="status">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Checking if this passenger exists…
                        </span>
                      ) : knownPassenger ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-800">
                          <div className="font-medium">✓ Existing passenger — {knownPassenger.name}</div>
                          <div className="text-emerald-700">
                            {knownPassenger.referredBy ? `Added by ${knownPassenger.referredBy.displayName}` : 'Added earlier'}
                            {knownPassenger.firstSeenAt ? ` · ${formatShortDate(new Date(knownPassenger.firstSeenAt))}` : ''}
                            {knownPassenger.tripsCount > 0 ? ` · ${knownPassenger.tripsCount} trip${knownPassenger.tripsCount === 1 ? '' : 's'}` : ''}
                          </div>
                          {passengerNameWatch.trim() && passengerNameWatch.trim().toLowerCase() !== knownPassenger.name.toLowerCase() ? (
                            <button type="button" className="mt-0.5 font-medium underline" onClick={() => setValue('passengerName', knownPassenger.name, { shouldValidate: true })}>
                              Use "{knownPassenger.name}"
                            </button>
                          ) : null}
                        </div>
                      ) : passengerLookup.isSuccess ? (
                        <span className="text-secondary">New passenger — they&apos;ll be added to the directory when you post this trip.</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Passenger phone" error={errors.passengerPhone?.message}>
                      <Input inputMode="tel" {...register('passengerPhone')} placeholder="+91…" />
                    </Field>
                    <Field label="Headcount" error={errors.passengerCount?.message}>
                      <Input type="number" min={1} max={20} step={1} inputMode="numeric" {...register('passengerCount', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1 && v <= 20) || '1–20 passengers' })} />
                    </Field>
                  </div>
                  <Field label="Luggage notes (optional)">
                    <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" {...register('luggageNotes')} />
                  </Field>
                  <Field label="Special requests (optional)">
                    <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" {...register('specialRequests')} />
                  </Field>

                  {/* Visibility note when user chooses to show passenger details */}
                  {!hidePassengerPhoneWatch ? (
                    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>Passenger details are shared with the driver only after the trip is assigned.</span>
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" {...register('hidePassengerPhone')} /> Keep passenger details hidden from drivers until assigned
                  </label>
                </div>
              ) : null}
            </Card>

            <Card className="gap-3">
              <div className={sectionLabel}>More details</div>
              <Field label="Instructions for the driver (optional)">
                <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" {...register('driverInstructions')} />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" {...register('showFareToPassenger')} /> Show the fare to the passenger
              </label>
            </Card>

            {postTrip.isError ? <p className="text-sm text-red-700">Couldn&apos;t post the trip — please try again.</p> : null}
          </>
        )}
      </form>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t bg-white px-4 py-3">
        {step === 1 ? (
          <>
            {summary ? <p className="mb-2 truncate text-center text-xs text-secondary">{summary}</p> : null}
            <Button type="button" variant="full" disabled={!step1Ready} onClick={() => void onNext()}>
              Next: price &amp; details →
            </Button>
          </>
        ) : (
          <Button type="button" variant="full" disabled={submitting} onClick={() => void handleSubmit(onSubmit)()}>
            {submitting ? 'Posting…' : 'Post trip'}
          </Button>
        )}
      </div>

      {postedTrip ? <ShareTripModal trip={postedTrip} onClose={() => navigate(`/trips/${postedTrip.id}`)} /> : null}
    </div>
  );
}

export default PostTripPage;
