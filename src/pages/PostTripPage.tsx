import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { AlertTriangle, ArrowLeft, BellRing, Car, ChevronDown, ChevronRight, FileText, Info, Loader2, Route, Users, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePostTrip, useTrip, useTripMatchPreview, useUpdateTripDetails } from '@/hooks/useTrips';
import { useAppBack } from '@/hooks/useAppBack';
import { useMyAgent, useMyDriver } from '@/hooks/useDrivers';
import { useLookupPassengerByPhone, isLookupablePhone } from '@/hooks/usePassengers';
import { carTypeHooks, cityHooks, useAppSettings } from '@/hooks/useAdminConfig';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { KycGateNotice } from '@/components/driver';
import { PlacePinField } from '@/components/location/PlacePinField';
import { AddressField } from '@/components/location/AddressField';
import { TripCategoryTabs } from '@/components/trip/TripCategoryTabs';
import { TripDirectionToggle, type TripDirection } from '@/components/trip/TripDirectionToggle';
import { PackageSelector, type PackageOption } from '@/components/trip/PackageSelector';
import { WaypointEditor, type WaypointDraft } from '@/components/trip/WaypointEditor';
import { buildWaypointInputs, editUpdateToastMessage } from '@/pages/postTripWaypoints';
import { Button, Card, Input, ProgressBar, SectionLabel, Select, StatusBanner, StickyFooterCTA } from '@/components/ui';
import { DateTimeField } from '@/components/form';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { cn, formatINR, formatKmAndDuration, formatPickupDateTime, formatShortDate, haversineKm } from '@/lib/utils';
import type { Place, PostTripInput, Trip, TripCategory, UpdateTripDetailsInput } from '@/types';

interface PostTripForm {
  fromCityId: string;
  toCityId: string;
  pickupAt: string;
  expectedDistanceKm: number;
  carTypeId: string;
  seatsRequired: number;
  acRequired: boolean;
  ratePerKm: number;
  /** Package only — the agent-entered total rental price. */
  packagePrice: number;
  driverBata: number;
  gstAmount: number;
  /** Phase 1 of the two-step handshake — 5–30 min. */
  acceptanceWindowMinutes: number;
  extrasPaidByPassenger: boolean;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageNotes: string;
  specialRequests: string;
  driverInstructions: string;
  showFareToPassenger: boolean;
  hidePassengerPhone: boolean;
  autoInviteMatches: boolean;
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
  packagePrice: 0,
  driverBata: 0,
  gstAmount: 0,
  acceptanceWindowMinutes: 15,
  extrasPaidByPassenger: true,
  passengerName: '',
  passengerPhone: '',
  passengerCount: 1,
  luggageNotes: '',
  specialRequests: '',
  driverInstructions: '',
  showFareToPassenger: true,
  hidePassengerPhone: true,
  autoInviteMatches: true,
};

const STEP1_FIELDS = ['fromCityId', 'toCityId', 'pickupAt', 'expectedDistanceKm', 'carTypeId', 'seatsRequired', 'acRequired'] as const;
const PREFERRED_DEFAULT_CAR_TYPE = 'SUV';
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
 * `/app/trips/new` — post a trip, as a 2-step wizard mirroring the prototype:
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
  const back = useAppBack();
  // `/app/trips/:id/edit` reuses this page in edit mode. When `:id` is set, we hydrate the
  // form from the existing trip and PATCH instead of POST on submit. The entry buttons
  // (Home priority card + trip-detail page) gate on `status ∈ {open, has_applicants}`
  // and `selectedDriverId == null`; the backend re-checks via the PATCH 409.
  const { id: editTripId } = useParams<{ id?: string }>();
  const isEdit = !!editTripId;
  const effectiveRole = useEffectiveRole();
  const isDriver = effectiveRole === 'driver';
  const myDriverQuery = useMyDriver(isDriver);
  const myAgentQuery = useMyAgent(!isDriver);
  const myKycStatus = (isDriver ? myDriverQuery.data?.kycStatus : myAgentQuery.data?.kycStatus) ?? undefined;
  const postTrip = usePostTrip();
  const updateTrip = useUpdateTripDetails();
  const editingTripQuery = useTrip(editTripId);
  const citiesQuery = cityHooks.useList();
  const carTypesQuery = carTypeHooks.useList();
  const appSettings = useAppSettings();
  const [step, setStep] = useState<1 | 2>(1);
  const [postedTrip, setPostedTrip] = useState<Trip | null>(null);
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [returnPlace, setReturnPlace] = useState<Place | null>(null);
  // Edit-mode hydration: pre-fill form ONCE when the existing trip arrives. The
  // `hydrated` flag prevents react-query re-fetches from clobbering in-progress edits.
  const [editHydrated, setEditHydrated] = useState(false);
  // Pre-submit conflict banner: applicants/invitees that appeared while the agent
  // was editing. Surfaced just before Update fires.
  const [conflictCount, setConflictCount] = useState<number | null>(null);
  // Diff confirm modal: shown when the agent's Update changes a notify-worthy field
  // AND there are applicants/invitees who'll be alerted. Last chance to back out.
  const [pendingDiff, setPendingDiff] = useState<null | {
    changes: Array<{ label: string; before: string; after: string }>;
    recipientCount: number;
    submit: () => void;
  }>(null);
  // ── trip-category state (migration 071) ─────────────────────────────────────
  const [category, setCategory] = useState<TripCategory>('outstation');
  const [direction, setDirection] = useState<TripDirection>('one_way'); // Outstation only
  const [packageOption, setPackageOption] = useState<PackageOption | null>(null);
  const [expectedEndAt, setExpectedEndAt] = useState<string>('');     // datetime-local; required for round_trip
  const [stops, setStops] = useState<WaypointDraft[]>([]);            // intermediate stops (city or address mode)
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [passengerSectionOpen, setPassengerSectionOpen] = useState(false);
  const passengerSectionRef = useRef<HTMLDivElement>(null);

  const { register, handleSubmit, watch, setValue, getValues, trigger, formState, control } = useForm<PostTripForm>({ defaultValues: DEFAULTS });
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    const s = appSettings.data;
    if (!s) return;
    const cur = getValues();
    if (!cur.driverBata) setValue('driverBata', s.defaultDriverBata);
    if (!cur.gstAmount) setValue('gstAmount', s.defaultGstAmount);
    if (!cur.driverInstructions && s.defaultDriverInstructions) setValue('driverInstructions', s.defaultDriverInstructions);
  }, [appSettings.data, getValues, setValue]);

  // Pre-select "SUV" once the car_types list loads. Skipped in edit mode — the
  // hydration effect below sets the real value from the loaded trip.
  useEffect(() => {
    if (isEdit) return;
    if (getValues('carTypeId')) return;
    const active = (carTypesQuery.data ?? []).filter((c) => c.isActive);
    if (active.length === 0) return;
    const preferred = active.find((c) => c.label.trim().toLowerCase() === PREFERRED_DEFAULT_CAR_TYPE.toLowerCase()) ?? active[0];
    if (preferred) setValue('carTypeId', preferred.id, { shouldDirty: false, shouldValidate: false });
  }, [carTypesQuery.data, getValues, setValue, isEdit]);

  // Edit-mode hydration: pre-fill the form ONCE from the loaded trip. Subsequent
  // re-renders are blocked by `editHydrated` so they don't overwrite mid-edit changes.
  // Mirror of PostVacancyPage's pattern.
  useEffect(() => {
    if (!isEdit || editHydrated || !editingTripQuery.data) return;
    const t = editingTripQuery.data;
    // Format an ISO timestamp into the `YYYY-MM-DDTHH:mm` shape `<input type="datetime-local">` /
    // DateTimeField expect (local time so it reads to the user as the local clock time).
    const toLocal = (iso: string | null | undefined): string => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setValue('fromCityId', t.fromCity.id, { shouldDirty: false });
    setValue('toCityId', t.toCity.id, { shouldDirty: false });
    setValue('pickupAt', toLocal(t.pickupAt), { shouldDirty: false });
    setValue('expectedDistanceKm', t.expectedDistanceKm, { shouldDirty: false });
    setValue('carTypeId', t.carTypeId, { shouldDirty: false });
    setValue('seatsRequired', t.seatsRequired, { shouldDirty: false });
    setValue('acRequired', t.acRequired, { shouldDirty: false });
    setValue('ratePerKm', t.ratePerKm, { shouldDirty: false });
    setValue('driverBata', t.driverBata, { shouldDirty: false });
    setValue('gstAmount', t.gstAmount, { shouldDirty: false });
    setValue('acceptanceWindowMinutes', t.acceptanceWindowMinutes ?? 15, { shouldDirty: false });
    setValue('extrasPaidByPassenger', t.extrasPaidByPassenger, { shouldDirty: false });
    setValue('passengerName', t.passengerName ?? '', { shouldDirty: false });
    setValue('passengerPhone', t.passengerPhone ?? '', { shouldDirty: false });
    setValue('passengerCount', t.passengerCount ?? 1, { shouldDirty: false });
    setValue('driverInstructions', t.driverInstructions ?? '', { shouldDirty: false });
    setValue('showFareToPassenger', t.showFareToPassenger, { shouldDirty: false });
    setValue('hidePassengerPhone', t.hidePassengerPhone, { shouldDirty: false });
    setCategory(t.tripCategory ?? 'outstation');
    setDirection(t.tripType === 'round_trip' ? 'round_trip' : 'one_way');
    if (t.tripCategory === 'package' && t.packageHours && t.packageIncludedKm) {
      setPackageOption({ hours: t.packageHours, includedKm: t.packageIncludedKm });
      setValue('packagePrice', t.totalFare, { shouldDirty: false });
    }
    if (t.fromPlace) setFromPlace(t.fromPlace);
    if (t.toPlace) setToPlace(t.toPlace);
    if (t.expectedEndAt) setExpectedEndAt(toLocal(t.expectedEndAt));
    if (t.passengerName || t.passengerPhone) setPassengerSectionOpen(true);
    setEditHydrated(true);
  }, [isEdit, editHydrated, editingTripQuery.data, setValue]);

  const [fromCityId, toCityId, distanceWatch, carTypeId, acRequired, rateWatch, packagePriceWatch, passengerPhoneWatch, passengerNameWatch, hidePassengerPhoneWatch, pickupAtWatch, driverBataWatch, autoInviteWatch] = watch(['fromCityId', 'toCityId', 'expectedDistanceKm', 'carTypeId', 'acRequired', 'ratePerKm', 'packagePrice', 'passengerPhone', 'passengerName', 'hidePassengerPhone', 'pickupAt', 'driverBata', 'autoInviteMatches']);
  // Auto-invite preview — re-runs whenever the pickup city OR the planned interval
  // changes. The server filters vacancies by [available_from, available_until] against
  // the trip's [pickupAt, expectedEndAt]; without these the count would be meaningless
  // (year-2060 trip would have falsely shown "1 driver available"). The Post button is
  // gated on this query having settled (see submitting).
  // Match-preview only runs for Outstation (it keys off the pickup city). Local + Package have
  // no curated city on the form, so the preview is disabled — and the Post button must not wait
  // on a query that will never run.
  const previewEnabled = !!fromCityId && !!pickupAtWatch;
  const matchPreview = useTripMatchPreview(
    fromCityId || undefined,
    pickupAtWatch || undefined,
    expectedEndAt || undefined,
    carTypeId || undefined,
    previewEnabled,
  );
  const previewSettled = !previewEnabled || (!matchPreview.isFetching && (matchPreview.isSuccess || matchPreview.isError));
  const distance = Number(distanceWatch) || 0;
  const rate = Number(rateWatch) || 0;
  // Multi-day pricing preview — driver_bata is per-day; total = bata × ceil((end − start) / 1 day).
  // Single-leg trips (no expected_end_at typed) default to 1 day so the preview matches today's behaviour.
  const tripDays = (() => {
    if (!pickupAtWatch || !expectedEndAt) return 1;
    const start = new Date(pickupAtWatch).getTime();
    const end = new Date(expectedEndAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
    return Math.max(1, Math.ceil((end - start) / 86_400_000));
  })();
  const bataPerDay = Math.max(0, Math.round(Number(driverBataWatch) || 0));
  const bataTotal = bataPerDay * tripDays;
  const totalFare = distance > 0 && rate > 0 ? Math.round(distance * rate) : 0;
  // What the fare-summary row shows: agent-entered price for Package, else distance × rate.
  const displayFare = category === 'package' ? Math.max(0, Math.round(Number(packagePriceWatch) || 0)) : totalFare;
  const cityName = (id: string) => citiesQuery.data?.find((c) => c.id === id)?.name;
  const carTypeName = (id: string) => carTypesQuery.data?.find((c) => c.id === id)?.label;

  // The expected distance is computed from the picked route (the curated city's centre, or the
  // pinned exact spot when one is set) — the poster never types it. A short delay debounces rapid
  // changes and lets the "calculating…" indicator paint.
  // For multi-way the chain is summed leg-by-leg (origin → stop 1 → … → final, + optionally
  // origin again when "Return to start" is ticked). One-way / round-trip stay at the legacy
  // 2-point haversine — round-trip drivers actually cover the route twice but the fare math
  // hasn't changed semantics, so we leave that decision for a separate commit.
  const citiesData = citiesQuery.data;
  useEffect(() => {
    // Package: the trip "distance" is just the included-km cap — no route to sum.
    if (category === 'package') {
      setDistanceCalculating(false);
      setValue('expectedDistanceKm', packageOption ? packageOption.includedKm : 0, { shouldValidate: true });
      return;
    }
    const coordsOf = (id: string) => citiesData?.find((c) => c.id === id);
    type Pt = { lat: number; lng: number };
    const valid = (p: { lat?: number; lng?: number } | undefined | null): p is Pt =>
      !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
    // A stop's coords — its searched place (address mode) or its city (city mode).
    const stopPt = (s: WaypointDraft) => (s.place ? s.place : coordsOf(s.cityId));

    // Build the ordered chain of coordinate pairs to sum: origin → stops → final
    // (round-trip ends back at the origin).
    const chain: Pt[] = [];
    const origin = fromPlace ?? coordsOf(fromCityId);
    if (valid(origin)) chain.push({ lat: origin.lat, lng: origin.lng });
    for (const s of stops) {
      const p = stopPt(s);
      if (valid(p)) chain.push({ lat: p.lat, lng: p.lng });
    }
    if (category === 'outstation' && direction === 'round_trip') {
      if (valid(origin)) chain.push({ lat: origin.lat, lng: origin.lng });
    } else {
      const dest = toPlace ?? coordsOf(toCityId);
      if (valid(dest)) chain.push({ lat: dest.lat, lng: dest.lng });
    }

    if (chain.length < 2) {
      setDistanceCalculating(false);
      return;
    }
    setDistanceCalculating(true);
    const t = setTimeout(() => {
      let totalKm = 0;
      for (let i = 1; i < chain.length; i++) {
        totalKm += haversineKm(chain[i - 1]!.lat, chain[i - 1]!.lng, chain[i]!.lat, chain[i]!.lng);
      }
      setValue('expectedDistanceKm', Math.max(1, Math.round(totalKm * ROAD_DISTANCE_FACTOR)), { shouldValidate: true });
      setDistanceCalculating(false);
    }, 450);
    return () => clearTimeout(t);
  }, [category, direction, fromCityId, toCityId, fromPlace, toPlace, stops, packageOption, citiesData, setValue]);

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

  // Category-aware route validation — returns an error string (toast + block) or null.
  function routeError(): string | null {
    if (category === 'package') {
      if (!fromPlace) return 'Search the pickup address';
      if (!packageOption) return 'Pick a rental package (hours)';
      return null;
    }
    if (category === 'local') {
      if (!fromPlace) return 'Search the pickup address';
      if (!toPlace) return 'Search the drop-off address';
      const bad = stops.findIndex((s) => !s.placeId);
      if (bad >= 0) return `Stop ${bad + 1} needs an address`;
      return null;
    }
    // Outstation
    if (!getValues('fromCityId')) return 'Pick a starting city';
    if (direction === 'round_trip') {
      if (stops.length < 1) return 'Add at least the first stop (the round trip returns to the start)';
      const bad = stops.findIndex((s) => !s.cityId);
      if (bad >= 0) return `Stop ${bad + 1} needs a city`;
      if (!expectedEndAt) return 'Set when the trip ends';
      return null;
    }
    // Outstation one-way
    if (!getValues('toCityId')) return 'Pick a destination city';
    if (getValues('fromCityId') === getValues('toCityId')) return 'Pickup and drop-off cities must be different';
    const bad = stops.findIndex((s) => !s.cityId);
    if (bad >= 0) return `Stop ${bad + 1} needs a city`;
    return null;
  }

  async function onNext() {
    // Always validate the schedule + vehicle fields; the city fields only matter for Outstation.
    const skip: (keyof PostTripForm)[] = category === 'outstation'
      ? (direction === 'round_trip' ? ['toCityId'] : [])
      : ['fromCityId', 'toCityId'];
    const fields = STEP1_FIELDS.filter((f) => !skip.includes(f));
    const ok = await trigger(fields as readonly (keyof PostTripForm)[]);
    if (!ok) return;
    const err = routeError();
    if (err) { toast.error(err); return; }
    setStep(2);
  }

  async function onSubmit(values: PostTripForm) {
    const err = routeError();
    if (err) { toast.error(err); setStep(1); return; }
    const pickupIso = new Date(values.pickupAt).toISOString();
    // Round-trip needs an explicit end; otherwise the server computes one from the route/hours.
    const endIso = expectedEndAt ? new Date(expectedEndAt).toISOString() : undefined;
    const waypointInputs = buildWaypointInputs({
      category,
      direction,
      fromCityId: values.fromCityId,
      toCityId: values.toCityId,
      fromPlaceId: fromPlace?.id,
      toPlaceId: toPlace?.id,
      returnPlaceId: returnPlace?.id,
      endIso,
      stops,
    });
    const isPackage = category === 'package';
    const submitRatePerKm = isPackage ? 0 : Number(values.ratePerKm);
    const submitTotalFare = isPackage ? Math.max(0, Math.round(Number(values.packagePrice) || 0)) : totalFare;
    const input: PostTripInput = {
      tripType: category === 'outstation' && direction === 'round_trip' ? 'round_trip' : undefined,
      tripCategory: category,
      packageHours: isPackage ? packageOption?.hours : undefined,
      packageIncludedKm: isPackage ? packageOption?.includedKm : undefined,
      waypoints: waypointInputs,
      expectedEndAt: endIso,
      // Outstation sends cities; Local/Package send a place and let the server derive the city.
      fromCityId: category === 'outstation' ? values.fromCityId : '',
      toCityId: category === 'outstation' ? (direction === 'round_trip' ? values.fromCityId : values.toCityId) : '',
      fromPlaceId: fromPlace?.id,
      toPlaceId: isPackage ? undefined : toPlace?.id,
      pickupAt: pickupIso,
      expectedDistanceKm: Number(values.expectedDistanceKm),
      carTypeId: values.carTypeId,
      seatsRequired: Number(values.seatsRequired),
      acRequired: values.acRequired,
      ratePerKm: submitRatePerKm,
      totalFare: submitTotalFare,
      commissionPct: appSettings.data?.defaultCommissionPct ?? 0,
      gstAmount: Math.max(0, Math.round(Number(values.gstAmount) || 0)),
      driverBata: Math.max(0, Math.round(Number(values.driverBata) || 0)),
      acceptanceWindowMinutes: Math.min(30, Math.max(5, Math.round(Number(values.acceptanceWindowMinutes) || 15))),
      extrasPaidByPassenger: values.extrasPaidByPassenger,
      driverInstructions: values.driverInstructions.trim() || undefined,
      passengerName: passengerSectionOpen ? values.passengerName.trim() : '',
      passengerPhone: passengerSectionOpen ? values.passengerPhone.trim() : '',
      passengerCount: Number(values.passengerCount),
      luggageNotes: passengerSectionOpen ? (values.luggageNotes.trim() || undefined) : undefined,
      specialRequests: passengerSectionOpen ? (values.specialRequests.trim() || undefined) : undefined,
      showFareToPassenger: values.showFareToPassenger,
      hidePassengerPhone: values.hidePassengerPhone,
      autoInviteMatches: values.autoInviteMatches,
    };
    // ── EDIT MODE ─────────────────────────────────────────────────────────
    // We don't POST a new trip — we PATCH the existing one. Two pre-flight checks:
    //   (1) Refetch the trip and surface a conflict banner if applicants/invitees
    //       appeared while editing. The agent has to click Update twice (once to
    //       see the warning, once to confirm).
    //   (2) If a notify-worthy field changed AND there's at least one recipient,
    //       show a confirm modal listing each change. The backend fans out
    //       trip_updated notifications on PATCH; this is the last chance to back out.
    if (isEdit && editTripId) {
      const refresh = await editingTripQuery.refetch();
      const fresh = refresh.data;
      if (!fresh) {
        toast.error("Couldn't re-check the trip — please try again.");
        return;
      }
      const newRecipientCount = (fresh.applicantCount ?? 0) + (fresh.pendingInvitationCount ?? 0);
      const oldRecipientCount = (editingTripQuery.data?.applicantCount ?? 0) + (editingTripQuery.data?.pendingInvitationCount ?? 0);
      if (newRecipientCount > oldRecipientCount && conflictCount === null) {
        setConflictCount(newRecipientCount);
        toast.warning(`${newRecipientCount - oldRecipientCount} new driver${newRecipientCount - oldRecipientCount === 1 ? '' : 's'} applied while you were editing — review above before continuing.`);
        return;
      }

      // Build the PATCH payload (only commercial / scheduling / vehicle fields).
      const patch: UpdateTripDetailsInput = {
        ratePerKm: Number(values.ratePerKm),
        driverBata: Math.max(0, Math.round(Number(values.driverBata) || 0)),
        gstAmount: Math.max(0, Math.round(Number(values.gstAmount) || 0)),
        pickupAt: pickupIso,
        carTypeId: values.carTypeId,
        acRequired: values.acRequired,
        seatsRequired: Number(values.seatsRequired),
        driverInstructions: values.driverInstructions.trim() || null,
        extrasPaidByPassenger: values.extrasPaidByPassenger,
        showFareToPassenger: values.showFareToPassenger,
      };

      // Build a human-readable diff vs the loaded trip. Only notify-worthy fields show up.
      const original = editingTripQuery.data!;
      const candidateChanges: Array<{ label: string; before: string; after: string }> = [];
      if (patch.pickupAt && new Date(patch.pickupAt).toISOString() !== new Date(original.pickupAt).toISOString()) {
        candidateChanges.push({ label: 'Pickup', before: formatPickupDateTime(original.pickupAt), after: formatPickupDateTime(patch.pickupAt) });
      }
      if (patch.ratePerKm !== original.ratePerKm) candidateChanges.push({ label: 'Rate / km', before: `₹${original.ratePerKm}`, after: `₹${patch.ratePerKm}` });
      if (patch.driverBata !== original.driverBata) candidateChanges.push({ label: 'Driver bata', before: `₹${original.driverBata}`, after: `₹${patch.driverBata}` });
      if (patch.gstAmount !== original.gstAmount) candidateChanges.push({ label: 'GST', before: `₹${original.gstAmount}`, after: `₹${patch.gstAmount}` });
      if (patch.carTypeId !== original.carTypeId) {
        const beforeLbl = (carTypesQuery.data ?? []).find((c) => c.id === original.carTypeId)?.label ?? original.carTypeId;
        const afterLbl = (carTypesQuery.data ?? []).find((c) => c.id === patch.carTypeId)?.label ?? patch.carTypeId;
        candidateChanges.push({ label: 'Car type', before: String(beforeLbl), after: String(afterLbl) });
      }
      if (patch.seatsRequired !== original.seatsRequired) candidateChanges.push({ label: 'Seats', before: String(original.seatsRequired), after: String(patch.seatsRequired) });
      if (patch.acRequired !== original.acRequired) candidateChanges.push({ label: 'AC required', before: original.acRequired ? 'Yes' : 'No', after: patch.acRequired ? 'Yes' : 'No' });

      const commitPatch = async () => {
        try {
          await updateTrip.mutateAsync({ tripId: editTripId, input: patch });
          toast.success(editUpdateToastMessage(newRecipientCount, candidateChanges.length));
          navigate(`/app/trips/${editTripId}`);
        } catch {
          toast.error("Couldn't update the trip — try again.");
        }
      };
      if (candidateChanges.length > 0 && newRecipientCount > 0) {
        setPendingDiff({ changes: candidateChanges, recipientCount: newRecipientCount, submit: () => { setPendingDiff(null); void commitPatch(); } });
        return;
      }
      await commitPatch();
      return;
    }

    try {
      const trip = await postTrip.mutateAsync(input);
      const invited = trip.autoInvitedCount ?? 0;
      toast.success(invited > 0 ? `Trip posted — ${invited} driver${invited === 1 ? '' : 's'} invited` : 'Trip posted — share it with drivers');
      setPostedTrip(trip);
    } catch {
      toast.error("Couldn't post the trip — try again.");
    }
  }

  const kycQueryPending = isDriver ? myDriverQuery.isPending : myAgentQuery.isPending;
  if (citiesQuery.isPending || carTypesQuery.isPending || kycQueryPending || (isEdit && !editHydrated && (editingTripQuery.isPending || editingTripQuery.isFetching))) {
    return (
      <div className="mx-auto max-w-md p-4">
        <h1 className="mb-3 text-xl font-bold">{isEdit ? 'Edit trip' : 'Post a trip'}</h1>
        <LoadingSkeleton rows={6} />
      </div>
    );
  }
  if (isEdit && editingTripQuery.isError) {
    return (
      <div className="mx-auto max-w-md p-4">
        <ErrorState title="Couldn't load this trip" message="We couldn't fetch the details — try again." onRetry={() => void editingTripQuery.refetch()} />
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
        <button type="button" onClick={back} className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
        <KycGateNotice heading="Get verified to post a trip" body="Once your account is verified you can post commercial trips and assign drivers. Your profile has a checklist that walks you through it." />
      </div>
    );
  }

  const cities = citiesQuery.data ?? [];
  const carTypes = (carTypesQuery.data ?? []).filter((c) => c.isActive);
  const isPackageCategory = category === 'package';
  const submitting = isSubmitting || postTrip.isPending;
  const routeReady = routeError() === null;
  const endTimeReady = !(category === 'outstation' && direction === 'round_trip') || !!expectedEndAt;
  const distanceReady = category === 'package' ? !!packageOption : distance >= 1 && !distanceCalculating;
  const step1Ready = routeReady && !!getValues('pickupAt') && endTimeReady && distanceReady && !!carTypeId && Number(getValues('seatsRequired')) >= 1;
  const routeSummary = category === 'package'
    ? (fromPlace ? `${fromPlace.name}${packageOption ? ` · ${packageOption.hours}hr/${packageOption.includedKm}km` : ''}` : null)
    : category === 'local'
      ? (fromPlace && toPlace ? `${fromPlace.name} → ${toPlace.name}` : null)
      : (cityName(fromCityId) ? `${cityName(fromCityId)} → ${direction === 'round_trip' ? cityName(fromCityId) : cityName(toCityId)}` : null);
  const summary = [routeSummary, category !== 'package' && distance > 0 ? `${distance} km` : null, carTypeName(carTypeId) ?? null, acRequired ? 'AC' : null].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 bg-surface shadow-header">
        <div className="flex items-center gap-2 px-4 py-3">
          <button type="button" aria-label="Back" onClick={() => (step === 1 ? back() : setStep(1))} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{isEdit ? 'Edit trip' : 'Post a trip'} · {step === 1 ? 'where & when' : 'price & details'}</h1>
            <div className="text-xs text-secondary">Step {step} of 2</div>
          </div>
        </div>
        <ProgressBar value={step} max={2} ariaLabel={`Step ${step} of 2`} className="rounded-none h-1" />
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="flex-1 space-y-3 p-4 pb-28">
        {step === 1 ? (
          <>
            <TripCategoryTabs value={category} onChange={setCategory} />
            <Card className="gap-3">
              <SectionLabel icon={<Route />} accent="green">
                {category === 'local' ? 'Local trip' : category === 'package' ? 'Rental package' : 'Outstation plan'}
              </SectionLabel>

              {category === 'outstation' ? (
                <TripDirectionToggle value={direction} onChange={setDirection} />
              ) : null}

              {category === 'package' ? (
                <>
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium">Pickup address</span>
                    <AddressField value={fromPlace} onChange={setFromPlace} searchLabel="Search the pickup address" pickerTitle="Pickup address" />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium">Rental package</span>
                    <PackageSelector value={packageOption} onChange={setPackageOption} />
                    <p className="text-xs text-secondary">The car is hired for these hours; extra km/hours beyond the package are settled separately.</p>
                  </div>
                </>
              ) : category === 'local' ? (
                <>
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium">From (pickup address)</span>
                    <AddressField value={fromPlace} onChange={setFromPlace} searchLabel="Search the pickup address" pickerTitle="Pickup address" />
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Stops (optional)</span>
                    <WaypointEditor value={stops} onChange={setStops} cities={cities} mode="address" near={fromPlace ? { lat: fromPlace.lat, lng: fromPlace.lng } : undefined} rowLabel="Stop" minRows={0} addLabel="Add stop" />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium">To (drop-off address)</span>
                    <AddressField value={toPlace} onChange={setToPlace} searchLabel="Search the drop-off address" pickerTitle="Drop-off address" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Field label="Trip starts from (city)" error={errors.fromCityId?.message}>
                      <Select tone="accent" {...register('fromCityId', { required: 'Pick a starting city' })}>
                        <option value="">Select a city</option>
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <PlacePinField value={fromPlace} onChange={setFromPlace} pinLabel="Pin the exact pickup point" pickerTitle="Pickup location" />
                  </div>

                  {direction === 'round_trip' ? (
                    <>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Stops (in order)</span>
                        <WaypointEditor value={stops} onChange={setStops} cities={cities} rowLabel="Stop" firstRowLabel="First stop" minRows={1} addLabel="Add stop" />
                      </div>
                      <div className="space-y-1.5">
                        <Field label="To (drop-off city)">
                          <Select tone="accent" value={fromCityId} disabled aria-readonly="true">
                            <option value={fromCityId}>{cityName(fromCityId) ?? 'Same as start city'}</option>
                          </Select>
                        </Field>
                        <p className="text-xs text-secondary">A round trip returns to the start city.</p>
                        <PlacePinField value={returnPlace} onChange={setReturnPlace} pinLabel="Pin the exact return drop-off" pickerTitle="Return drop-off" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Stops (optional)</span>
                        <WaypointEditor value={stops} onChange={setStops} cities={cities} rowLabel="Stop" minRows={0} addLabel="Add stop" />
                      </div>
                      <div className="space-y-1.5">
                        <Field label="To (drop-off city)" error={errors.toCityId?.message}>
                          <Select tone="accent" {...register('toCityId', { required: 'Pick a destination city' })}>
                            <option value="">Select a city</option>
                            {cities.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </Select>
                        </Field>
                        <PlacePinField value={toPlace} onChange={setToPlace} pinLabel="Pin the exact drop-off point" pickerTitle="Drop-off location" />
                      </div>
                    </>
                  )}
                </>
              )}
              <Field label={category === 'outstation' && direction === 'round_trip' ? 'Trip starts (date & time)' : 'Pickup date & time'} error={errors.pickupAt?.message}>
                <Controller
                  control={control}
                  name="pickupAt"
                  rules={{ required: 'Set the start time', validate: (v) => (!!v && new Date(v).getTime() > Date.now()) || 'Start time must be in the future' }}
                  render={({ field, fieldState }) => (
                    <DateTimeField
                      id="pickupAt"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </Field>
              {category === 'outstation' && direction === 'round_trip' ? (
                <Field label="Trip ends (date & time)" hint="When the driver is back at the start city.">
                  <DateTimeField value={expectedEndAt} onChange={setExpectedEndAt} />
                </Field>
              ) : null}
              {/* keep the value in form state for validation + submit, but show it as an emerald summary row */}
              <input type="hidden" {...register('expectedDistanceKm', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1) || 'Pick the pickup & drop-off points so we can work out the distance' })} />
              <div className="rounded-control border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm" role="status" aria-live="polite">
                {category === 'package' ? (
                  packageOption ? (
                    <span className="text-emerald-900">Package: <strong className="font-bold text-emerald-700">{packageOption.hours} hr · {packageOption.includedKm} km included</strong></span>
                  ) : (
                    <span className="text-secondary">Pick a rental package to set the hours and included km.</span>
                  )
                ) : distanceCalculating ? (
                  <span className="flex items-center gap-1.5 text-secondary">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Calculating route…
                  </span>
                ) : distance >= 1 ? (
                  <span className="text-emerald-900">
                    Estimated distance: <strong className="font-bold text-emerald-700">{formatKmAndDuration(distance)}</strong>
                  </span>
                ) : (
                  <span className="text-secondary">Pick the pickup &amp; drop-off points to see the route distance and ETA.</span>
                )}
              </div>
              {errors.expectedDistanceKm ? <span className="block text-xs text-red-700">{errors.expectedDistanceKm.message}</span> : null}
            </Card>

            <Card className="gap-3">
              <SectionLabel icon={<Car />} accent="green">Vehicle Requirements</SectionLabel>
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
            {/* Conflict banner: applicants/invitees that appeared while editing. Surfaces
                on the first Update tap (the gate releases on the second tap so the agent
                can proceed if they still want to). */}
            {isEdit && conflictCount !== null && conflictCount > 0 ? (
              <Card className="gap-2 border-2 border-amber-300 bg-amber-50">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-amber-900">
                      {conflictCount} {conflictCount === 1 ? 'driver' : 'drivers'} applied or were invited while you were editing
                    </div>
                    <p className="mt-0.5 text-xs text-amber-800">
                      Review them first, or tap Update again to proceed — they&apos;ll be notified of the changes.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/app/trips/${editTripId}/applicants`)}>
                        Review applicants
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}
            <Card className="gap-3">
              <SectionLabel icon={<Wallet />} accent="green">Pricing</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {category === 'package' ? (
                  <Field label="Package price (₹)" error={errors.packagePrice?.message} hint={packageOption ? `For ${packageOption.hours} hr / ${packageOption.includedKm} km` : undefined}>
                    <Input type="number" min={1} step={1} inputMode="numeric" {...register('packagePrice', { valueAsNumber: true, validate: (v) => !isPackageCategory || (Number.isFinite(v) && v >= 1) || 'Enter the rental price' })} />
                  </Field>
                ) : (
                  <Field label="Rate per km (₹)" error={errors.ratePerKm?.message}>
                    <Input type="number" min={1} step={1} inputMode="numeric" {...register('ratePerKm', { valueAsNumber: true, validate: (v) => isPackageCategory || (Number.isFinite(v) && v >= 1) || 'Enter a rate per km' })} />
                  </Field>
                )}
                <Field
                  label="Driver bata (₹/day)"
                  error={errors.driverBata?.message}
                  hint={
                    tripDays > 1
                      ? `× ${tripDays} days = ${formatINR(bataTotal)} total (paid straight to the driver)`
                      : 'Paid straight to the driver, per day of the trip'
                  }
                >
                  <Input type="number" min={0} step={1} inputMode="numeric" {...register('driverBata', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 0) || 'Cannot be negative' })} />
                </Field>
              </div>
              <Field
                label="GST (₹)"
                error={errors.gstAmount?.message}
                hint="Flat amount per trip — pre-filled from platform settings, edit if this trip's GST is different."
              >
                <Input type="number" min={0} step={1} inputMode="numeric" {...register('gstAmount', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 0) || 'Cannot be negative' })} />
              </Field>
              <Field
                label={`Acceptance window: ${watch('acceptanceWindowMinutes') ?? 15} min`}
                error={errors.acceptanceWindowMinutes?.message}
                hint="After you pick a driver, they have this long to Accept. If they don't, the trip goes back to applicants. (Two-step handshake — see docs/TRIP_ASSIGNMENT_WORKFLOW.md.)"
              >
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  className="w-full accent-emerald-600"
                  {...register('acceptanceWindowMinutes', {
                    valueAsNumber: true,
                    validate: (v) => (Number.isFinite(v) && v >= 5 && v <= 30) || 'Pick a value between 5 and 30 minutes',
                  })}
                />
                <div className="flex justify-between text-[10px] uppercase tracking-wide text-secondary">
                  <span>5 min</span>
                  <span>30 min</span>
                </div>
              </Field>
              <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-secondary">{category === 'package' ? `Rental price (${packageOption ? `${packageOption.hours} hr / ${packageOption.includedKm} km` : 'package'})` : `Total fare (${distance > 0 ? distance : '—'} km × ${formatINR(rate)}/km)`}</span>
                  <span className="font-bold">{displayFare > 0 ? formatINR(displayFare) : '—'}</span>
                </div>
                <p className="mt-1 text-xs text-secondary">Commission, GST and the driver payout are calculated by TripKing — you&apos;ll see the final payout on the trip.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" {...register('showFareToPassenger')} /> Show the fare to the passenger
              </label>
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
                  <SectionLabel icon={<Users />} accent="green">Passenger Details</SectionLabel>
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
                    <StatusBanner tone="info" icon={<Info />}>
                      Passenger details are shared with the driver only after the trip is assigned.
                    </StatusBanner>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" {...register('hidePassengerPhone')} /> Keep passenger details hidden from drivers until assigned
                  </label>
                </div>
              ) : null}
            </Card>

            <Card
              className={`gap-3 transition-colors ${
                autoInviteWatch ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200' : ''
              }`}
            >
              <SectionLabel icon={<BellRing />} accent="green">Driver Invitations</SectionLabel>
              <label className="flex items-start gap-2 text-sm font-medium">
                <input type="checkbox" className="mt-0.5" {...register('autoInviteMatches')} />
                <span className="flex-1">
                  {autoInviteWatch ? 'Send automatic invites to matching drivers' : "I'll manually invite drivers"}
                  <span className="mt-0.5 block text-xs font-normal text-secondary">
                    {autoInviteWatch
                      ? (() => {
                          if (matchPreview.isFetching) return <>Searching for available drivers near the pickup city…</>;
                          if (matchPreview.isError) return <>Could not load preview — invites will still be sent on post (up to <strong className="font-semibold text-emerald-700">5</strong> closest).</>;
                          const total = matchPreview.data?.totalMatches ?? 0;
                          const willInvite = matchPreview.data?.willInvite ?? 0;
                          if (total === 0) return <>No matching drivers right now. You can still post — drivers with alerts will be notified.</>;
                          const totalNum = <strong className="font-bold text-emerald-700">{total}</strong>;
                          const inviteNum = <strong className="font-bold text-emerald-700">{total <= 5 ? total : willInvite}</strong>;
                          if (total <= 5) {
                            return <>{totalNum} matching driver{total === 1 ? '' : 's'} available — all {inviteNum} will be invited.</>;
                          }
                          return <>{totalNum} matching drivers available — top {inviteNum} will be invited (closest first).</>;
                        })()
                      : 'You can invite drivers from the trip detail page after posting.'}
                  </span>
                </span>
              </label>
            </Card>

            <Card className="gap-3">
              <SectionLabel icon={<FileText />} accent="green">More Details</SectionLabel>
              <Field label="Instructions for the driver (optional)">
                <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" {...register('driverInstructions')} />
              </Field>
            </Card>

            {postTrip.isError ? <p className="text-sm text-red-700">Couldn&apos;t post the trip — please try again.</p> : null}
          </>
        )}
      </form>

      <StickyFooterCTA>
        {step === 1 ? (
          <>
            {summary ? <p className="mb-2 truncate text-center text-xs text-secondary">{summary}</p> : null}
            <Button type="button" variant="full" disabled={!step1Ready} onClick={() => void onNext()}>
              Next: price &amp; details →
            </Button>
          </>
        ) : isEdit ? (
          <Button
            type="button"
            variant="full"
            disabled={submitting || updateTrip.isPending}
            onClick={() => void handleSubmit(onSubmit)()}
          >
            {submitting || updateTrip.isPending ? 'Updating…' : 'Update trip'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="full"
            disabled={submitting || !previewSettled}
            onClick={() => void handleSubmit(onSubmit)()}
            title={!previewSettled ? 'Checking for available drivers…' : undefined}
          >
            {submitting ? 'Posting…' : !previewSettled ? 'Checking drivers…' : 'Post trip'}
          </Button>
        )}
      </StickyFooterCTA>

      {postedTrip ? (
        <ShareTripModal
          trip={postedTrip}
          onClose={() => navigate(isDriver ? '/app/my-trips?tab=posted' : '/app/posted-trips?status=open')}
          onViewTrip={() => navigate(`/app/trips/${postedTrip.id}`)}
        />
      ) : null}

      {/* Diff confirm modal — last step before PATCH fires + the trip_updated
          notifications fan out. Lists each changed field so the agent sees exactly
          what their applicants will see. Cancel keeps them on the form. */}
      {pendingDiff ? (
        <div role="dialog" aria-modal="true" aria-labelledby="diff-confirm-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 id="diff-confirm-title" className="text-base font-bold">Send this update?</h2>
              <button type="button" aria-label="Cancel update" onClick={() => setPendingDiff(null)} className="rounded p-1 text-secondary hover:bg-muted">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-sm text-secondary">
              {pendingDiff.recipientCount} {pendingDiff.recipientCount === 1 ? 'driver who applied or was invited' : 'drivers who applied or were invited'} will be notified. They can withdraw if it doesn&apos;t work for them.
            </p>
            <ul className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              {pendingDiff.changes.map((c) => (
                <li key={c.label} className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-secondary">{c.label}</span>
                  <span><span className="text-red-700 line-through">{c.before}</span> <span className="mx-1 text-secondary">→</span> <span className="font-semibold text-emerald-700">{c.after}</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPendingDiff(null)}>
                Cancel
              </Button>
              <Button type="button" variant="full" className="flex-1" onClick={() => pendingDiff.submit()}>
                Send update
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PostTripPage;
