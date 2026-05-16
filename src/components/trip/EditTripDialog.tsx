import { useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { useUpdateTripDetails } from '@/hooks/useTrips';
import { carTypeHooks } from '@/hooks/useAdminConfig';
import { ApiError } from '@/lib/api/client';
import type { Trip, UpdateTripDetailsInput } from '@/types';

export interface EditTripDialogProps {
  trip: Trip;
  open: boolean;
  onClose: () => void;
}

interface FormShape {
  ratePerKm: number;
  driverBata: number;
  commissionPct: number;
  gstAmount: number;
  pickupAt: string;
  carTypeId: string;
  acRequired: boolean;
  seatsRequired: number;
  driverInstructions: string;
  extrasPaidByPassenger: boolean;
  showFareToPassenger: boolean;
}

/**
 * `datetime-local` needs a local-time `YYYY-MM-DDTHH:mm` string, not an ISO
 * UTC timestamp. The Trip.pickupAt is stored in UTC; convert it to the
 * browser's local zone for editing, then back to UTC ISO on submit.
 */
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalDatetimeInput(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * Edit a trip's commercial / scheduling / vehicle fields while it's still
 * `status === 'open'` (no applicants, no invites). The server is the gatekeeper
 * — it returns 409 if anything has changed since the dialog opened. Route
 * (from/to/via cities, waypoints) is intentionally not editable here.
 */
export function EditTripDialog({ trip, open, onClose }: EditTripDialogProps) {
  const carTypesQuery = carTypeHooks.useList();
  const carTypes = useMemo(() => (carTypesQuery.data ?? []).filter((c) => c.isActive), [carTypesQuery.data]);
  const update = useUpdateTripDetails();
  const { register, handleSubmit, watch, formState: { errors, isDirty } } = useForm<FormShape>({
    defaultValues: {
      ratePerKm: trip.ratePerKm,
      driverBata: trip.driverBata,
      commissionPct: trip.commissionPct,
      gstAmount: trip.gstAmount,
      pickupAt: toLocalDatetimeInput(trip.pickupAt),
      carTypeId: trip.carTypeId ?? '',
      acRequired: trip.acRequired,
      seatsRequired: trip.seatsRequired,
      driverInstructions: trip.driverInstructions ?? '',
      extrasPaidByPassenger: trip.extrasPaidByPassenger,
      showFareToPassenger: trip.showFareToPassenger ?? true,
    },
  });

  // Live preview: rate × distance — same math the server runs on save.
  const previewRate = Number(watch('ratePerKm'));
  const previewFare = Number.isFinite(previewRate) ? Math.round(trip.expectedDistanceKm * previewRate) : trip.totalFare;

  async function onSubmit(values: FormShape) {
    const input: UpdateTripDetailsInput = {};
    if (values.ratePerKm !== trip.ratePerKm) input.ratePerKm = values.ratePerKm;
    if (values.driverBata !== trip.driverBata) input.driverBata = values.driverBata;
    if (values.commissionPct !== trip.commissionPct) input.commissionPct = values.commissionPct;
    if (values.gstAmount !== trip.gstAmount) input.gstAmount = values.gstAmount;
    const nextPickup = fromLocalDatetimeInput(values.pickupAt);
    if (nextPickup && nextPickup !== trip.pickupAt) input.pickupAt = nextPickup;
    if (values.carTypeId && values.carTypeId !== trip.carTypeId) input.carTypeId = values.carTypeId;
    if (values.acRequired !== trip.acRequired) input.acRequired = values.acRequired;
    if (values.seatsRequired !== trip.seatsRequired) input.seatsRequired = values.seatsRequired;
    const trimmedInstructions = values.driverInstructions.trim();
    const existingInstructions = (trip.driverInstructions ?? '').trim();
    if (trimmedInstructions !== existingInstructions) input.driverInstructions = trimmedInstructions || null;
    if (values.extrasPaidByPassenger !== trip.extrasPaidByPassenger) input.extrasPaidByPassenger = values.extrasPaidByPassenger;
    if (values.showFareToPassenger !== (trip.showFareToPassenger ?? true)) input.showFareToPassenger = values.showFareToPassenger;

    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }

    try {
      await update.mutateAsync({ tripId: trip.id, input });
      toast.success('Trip updated.');
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Can't edit anymore — a driver has applied or been invited.");
        onClose();
      } else if (e instanceof ApiError && e.status === 422) {
        toast.error(e.message);
      } else {
        toast.error("Couldn't save — please try again.");
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-background p-5 shadow-xl outline-none">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-bold">Edit trip</Dialog.Title>
              <Dialog.Description className="text-xs text-secondary">
                Rate, payout, vehicle and timing — editable until a driver applies. Route stays locked.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="rounded-full p-1.5 text-secondary hover:bg-muted">
                <X className="size-4" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); void handleSubmit(onSubmit)(); }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Rate per km (₹)</span>
                <input
                  type="number" min={1} step={0.5} inputMode="decimal"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  {...register('ratePerKm', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v > 0) || 'Must be > 0' })}
                />
                {errors.ratePerKm ? <span className="block text-xs text-red-700">{errors.ratePerKm.message}</span> : null}
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Driver bata (₹)</span>
                <input
                  type="number" min={0} step={50} inputMode="numeric"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  {...register('driverBata', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 0) || 'Must be ≥ 0' })}
                />
                {errors.driverBata ? <span className="block text-xs text-red-700">{errors.driverBata.message}</span> : null}
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Commission %</span>
                <input
                  type="number" min={0} max={30} step={0.5} inputMode="decimal"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  {...register('commissionPct', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 0 && v <= 30) || '0–30' })}
                />
                {errors.commissionPct ? <span className="block text-xs text-red-700">{errors.commissionPct.message}</span> : null}
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">GST (₹)</span>
                <input
                  type="number" min={0} step={10} inputMode="numeric"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  {...register('gstAmount', { valueAsNumber: true, validate: (v) => (Number.isFinite(v) && v >= 0) || 'Must be ≥ 0' })}
                />
                {errors.gstAmount ? <span className="block text-xs text-red-700">{errors.gstAmount.message}</span> : null}
              </label>
            </div>

            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-secondary">
              New trip fare: <span className="font-semibold text-foreground">₹{previewFare.toLocaleString('en-IN')}</span> ({trip.expectedDistanceKm} km × ₹{Number.isFinite(previewRate) ? previewRate : trip.ratePerKm}/km). Driver payout is recomputed by the server.
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Pickup date & time</span>
              <input
                type="datetime-local"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                {...register('pickupAt', { required: 'Pickup time is required' })}
              />
              {errors.pickupAt ? <span className="block text-xs text-red-700">{errors.pickupAt.message}</span> : null}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Car type</span>
                <select
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  {...register('carTypeId', { required: 'Car type is required' })}
                  disabled={carTypesQuery.isPending}
                >
                  {carTypes.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                {errors.carTypeId ? <span className="block text-xs text-red-700">{errors.carTypeId.message}</span> : null}
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Seats required</span>
                <input
                  type="number" min={1} max={20} step={1} inputMode="numeric"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  {...register('seatsRequired', { valueAsNumber: true, validate: (v) => (Number.isInteger(v) && v >= 1 && v <= 20) || '1–20' })}
                />
                {errors.seatsRequired ? <span className="block text-xs text-red-700">{errors.seatsRequired.message}</span> : null}
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...register('acRequired')} />
              <span>AC required</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...register('extrasPaidByPassenger')} />
              <span>Packing / toll / permit extras paid by the passenger</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...register('showFareToPassenger')} />
              <span>Show fare on the passenger portal</span>
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Driver instructions (optional)</span>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
                placeholder="One per line — call before arrival, follow Google Maps, etc."
                {...register('driverInstructions')}
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={update.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={update.isPending || !isDirty}>
                {update.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
