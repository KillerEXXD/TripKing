import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { usePostTrip } from '@/hooks/useTrips';
import { carTypeHooks, cityHooks, useAppSettings } from '@/hooks/useAdminConfig';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { Button, Card, Input } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { PostTripInput, Trip } from '@/types';

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
  hidePassengerPhone: false,
};

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

const selectClass = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-base';

/**
 * `/trips/new` — post a trip. The poster sets the route, schedule, distance,
 * vehicle requirements, rate, bata and passenger details; the total fare is
 * `distance × rate`; commission / GST / driver payout are computed server-side.
 * Dropdowns + the bata default come from `useAdminConfig`. On success the new
 * trip is shown (sharing it lands with the share-card step).
 */
export function PostTripPage() {
  const navigate = useNavigate();
  const postTrip = usePostTrip();
  const citiesQuery = cityHooks.useList();
  const carTypesQuery = carTypeHooks.useList();
  const appSettings = useAppSettings();
  const [postedTrip, setPostedTrip] = useState<Trip | null>(null);

  const { register, handleSubmit, watch, setValue, getValues, formState } = useForm<PostTripForm>({ defaultValues: DEFAULTS });
  const { errors, isSubmitting } = formState;

  // Seed bata + driver instructions from the platform defaults once they load,
  // unless the poster has already typed something.
  useEffect(() => {
    const s = appSettings.data;
    if (!s) return;
    const cur = getValues();
    if (!cur.driverBata) setValue('driverBata', s.defaultDriverBata);
    if (!cur.driverInstructions && s.defaultDriverInstructions) setValue('driverInstructions', s.defaultDriverInstructions);
  }, [appSettings.data, getValues, setValue]);

  const distance = Number(watch('expectedDistanceKm')) || 0;
  const rate = Number(watch('ratePerKm')) || 0;
  const totalFare = distance > 0 && rate > 0 ? Math.round(distance * rate) : 0;

  async function onSubmit(values: PostTripForm) {
    if (values.fromCityId === values.toCityId) {
      toast.error('Pickup and drop-off cities must be different');
      return;
    }
    const input: PostTripInput = {
      fromCityId: values.fromCityId,
      toCityId: values.toCityId,
      pickupAt: new Date(values.pickupAt).toISOString(),
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
      passengerName: values.passengerName.trim(),
      passengerPhone: values.passengerPhone.trim(),
      passengerCount: Number(values.passengerCount),
      luggageNotes: values.luggageNotes.trim() || undefined,
      specialRequests: values.specialRequests.trim() || undefined,
      showFareToPassenger: values.showFareToPassenger,
      hidePassengerPhone: values.hidePassengerPhone,
    };
    try {
      const trip: Trip = await postTrip.mutateAsync(input);
      toast.success('Trip posted — share it with drivers');
      setPostedTrip(trip);
    } catch {
      toast.error("Couldn't post the trip — try again.");
    }
  }

  if (citiesQuery.isPending || carTypesQuery.isPending) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-4">
        <h1 className="text-xl font-bold">Post a trip</h1>
        <LoadingSkeleton rows={6} />
      </main>
    );
  }
  if (citiesQuery.isError || carTypesQuery.isError) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-4">
        <h1 className="text-xl font-bold">Post a trip</h1>
        <ErrorState
          title="Couldn't load the form"
          message="We need the city + car-type lists to post a trip."
          onRetry={() => {
            void citiesQuery.refetch();
            void carTypesQuery.refetch();
          }}
        />
      </main>
    );
  }

  const cities = citiesQuery.data ?? [];
  const carTypes = carTypesQuery.data ?? [];
  const submitting = isSubmitting || postTrip.isPending;

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-bold">Post a trip</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Card className="gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Route &amp; schedule</div>
          <Field label="From (pickup city)" error={errors.fromCityId?.message}>
            <select className={selectClass} {...register('fromCityId', { required: 'Pick a pickup city' })}>
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To (drop-off city)" error={errors.toCityId?.message}>
            <select className={selectClass} {...register('toCityId', { required: 'Pick a drop-off city' })}>
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pickup date &amp; time" error={errors.pickupAt?.message}>
            <Input type="datetime-local" {...register('pickupAt', { required: 'Set the pickup time', validate: (v) => (!!v && new Date(v).getTime() > Date.now()) || 'Pickup must be in the future' })} />
          </Field>
          <Field label="Expected distance (km)" error={errors.expectedDistanceKm?.message}>
            <Input type="number" min={1} step={1} inputMode="numeric" {...register('expectedDistanceKm', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1) || 'Enter the distance in km' })} />
          </Field>
        </Card>

        <Card className="gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Vehicle &amp; fare</div>
          <Field label="Car type required" error={errors.carTypeId?.message}>
            <select className={selectClass} {...register('carTypeId', { required: 'Pick a car type' })}>
              <option value="">Select a car type</option>
              {carTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Seats required" error={errors.seatsRequired?.message}>
              <Input type="number" min={1} max={50} step={1} inputMode="numeric" {...register('seatsRequired', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 1 && v <= 50) || '1–50 seats' })} />
            </Field>
            <label className="flex items-center gap-2 pt-7 text-sm font-medium">
              <input type="checkbox" {...register('acRequired')} /> AC required
            </label>
          </div>
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

        <Card className="gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Passenger</div>
          <Field label="Passenger name" error={errors.passengerName?.message}>
            <Input {...register('passengerName', { required: 'Enter the passenger name' })} placeholder="Full name" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Passenger phone" error={errors.passengerPhone?.message}>
              <Input inputMode="tel" {...register('passengerPhone', { required: 'Enter a phone number' })} placeholder="+91…" />
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
          <Field label="Instructions for the driver (optional)">
            <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" {...register('driverInstructions')} />
          </Field>
        </Card>

        <Card className="gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Visibility</div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...register('showFareToPassenger')} /> Show the fare to the passenger
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...register('hidePassengerPhone')} /> Hide the passenger&apos;s phone from drivers until assigned
          </label>
        </Card>

        {postTrip.isError ? <p className="text-sm text-red-700">Couldn&apos;t post the trip — please try again.</p> : null}
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/trips')} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="full" disabled={submitting}>
            {submitting ? 'Posting…' : 'Post trip'}
          </Button>
        </div>
      </form>

      {postedTrip ? <ShareTripModal trip={postedTrip} onClose={() => navigate(`/trips/${postedTrip.id}`)} /> : null}
    </main>
  );
}

export default PostTripPage;
