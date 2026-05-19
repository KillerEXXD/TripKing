/**
 * `/app/vehicles/:id/photos` — step 4 of the driver "Get verified" checklist. Photos of the car
 * (front / back / left / right / number-plate close-up, + optional interior) plus the RC book and
 * insurance (with expiry); an optional commercial permit too. Each upload PUTs straight to Storage
 * and the resulting object path is saved on the vehicle.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateVehicle, useVehicle } from '@/hooks/useVehicles';
import { useAppBack } from '@/hooks/useAppBack';
import { getVehiclePhotoUploadUrl } from '@/lib/api/services/vehicles';
import { Button, Card, Input, StatusBanner } from '@/components/ui';
import { FileUpload } from '@/components/form';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { Vehicle, VehicleInput, VehiclePhotoSlot } from '@/types';

const SLOT_TO_KEY: Record<VehiclePhotoSlot, keyof VehicleInput> = {
  front: 'photoFrontUrl', back: 'photoBackUrl', left: 'photoLeftUrl', right: 'photoRightUrl', plate: 'photoPlateUrl',
  interior: 'photoInteriorUrl', rc: 'rcBookUrl', insurance: 'insuranceUrl', permit: 'permitUrl',
};
const VEHICLE_URL: Record<VehiclePhotoSlot, keyof Vehicle> = {
  front: 'photoFrontUrl', back: 'photoBackUrl', left: 'photoLeftUrl', right: 'photoRightUrl', plate: 'photoPlateUrl',
  interior: 'photoInteriorUrl', rc: 'rcBookUrl', insurance: 'insuranceUrl', permit: 'permitUrl',
};
const REQUIRED: VehiclePhotoSlot[] = ['front', 'back', 'left', 'right', 'plate', 'rc', 'insurance'];

/** Today's date as `YYYY-MM-DD` in the browser's local TZ — used as the `min` attribute
 *  on the insurance/permit date inputs so a typo can't land the year at 1930. */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Header({ onBack }: { onBack: () => void }) {
  return <PageHeader title="Vehicle photos & papers" onBack={onBack} />;
}

export function VehiclePhotosPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = useAppBack('/app/profile');
  const vehicleQuery = useVehicle(id);
  const updateVehicle = useUpdateVehicle();

  if (vehicleQuery.isPending) return <div className="p-6"><LoadingSkeleton rows={6} /></div>;
  if (vehicleQuery.isError || !vehicleQuery.data) return <div className="p-6"><ErrorState title="Couldn't load that vehicle" onRetry={() => vehicleQuery.refetch()} /></div>;
  const vehicle = vehicleQuery.data;

  const uploadUrlFor = (slot: VehiclePhotoSlot) => () => getVehiclePhotoUploadUrl(vehicle.id, slot);
  const onUploaded = (slot: VehiclePhotoSlot) => (path: string) => {
    updateVehicle.mutate(
      { id: vehicle.id, patch: { [SLOT_TO_KEY[slot]]: path } as Partial<VehicleInput> },
      { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save that photo') },
    );
  };
  const valueFor = (slot: VehiclePhotoSlot): string => (vehicle[VEHICLE_URL[slot]] as string | undefined) ?? '';
  const missing = REQUIRED.filter((s) => !valueFor(s));
  const allRequiredDone = missing.length === 0;

  const photoTile = (slot: VehiclePhotoSlot, label: string, opts?: { allowPdf?: boolean; required?: boolean; hint?: string }) => (
    <FileUpload key={slot} label={label} hint={opts?.hint} required={opts?.required} allowPdf={opts?.allowPdf} value={valueFor(slot) || undefined} getUploadUrl={uploadUrlFor(slot)} onUploaded={onUploaded(slot)} />
  );

  // Save guard: rejects past dates even if the user keyboard-typed past the picker's
  // `min` attribute (some mobile browsers don't enforce it). Empty string clears the
  // value (permit is optional); a past date toasts + skips the save.
  function onExpiryChange(label: 'Insurance' | 'Permit', field: 'insuranceExpiry' | 'permitExpiry', value: string) {
    if (value && value < todayIso()) {
      toast.error(`${label} expiry can't be in the past.`);
      return;
    }
    updateVehicle.mutate(
      { id: vehicle.id, patch: { [field]: value || null } },
      { onError: () => toast.error('Could not save the expiry date') },
    );
  }

  return (
    <div>
      <Header onBack={back} />
      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-secondary">Take clear daylight photos of the whole car. The number-plate shot should clearly show the registration number.</p>

        <Card className="gap-4">
          <div className="text-sm font-semibold">Car photos</div>
          <div className="grid grid-cols-2 gap-3">
            {photoTile('front', 'Front', { required: true })}
            {photoTile('back', 'Back', { required: true })}
            {photoTile('left', 'Left side', { required: true })}
            {photoTile('right', 'Right side', { required: true })}
            {photoTile('plate', 'Number plate', { required: true, hint: 'Close-up of the registration plate.' })}
            {photoTile('interior', 'Interior (optional)')}
          </div>
        </Card>

        <Card className="gap-4">
          <div className="text-sm font-semibold">Papers</div>
          {photoTile('rc', 'RC book', { required: true, allowPdf: true })}
          {photoTile('insurance', 'Insurance', { required: true, allowPdf: true })}
          <div className="space-y-1.5">
            <label htmlFor="insx" className="text-sm font-medium">Insurance expiry</label>
            <Input
              id="insx"
              type="date"
              // `min=today` blocks the browser date picker from accepting a past date —
              // without it a typo like "30" lands the year at 1930 and the apply-to-trip
              // gate then says "Insurance has expired". The save handler below also
              // guards against direct keyboard entry.
              min={todayIso()}
              defaultValue={vehicle.insuranceExpiry ?? ''}
              onChange={(e) => onExpiryChange('Insurance', 'insuranceExpiry', e.target.value)}
            />
          </div>
          {photoTile('permit', 'Commercial permit (optional)', { allowPdf: true })}
          <div className="space-y-1.5">
            <label htmlFor="permx" className="text-sm font-medium">Permit expiry (optional)</label>
            <Input
              id="permx"
              type="date"
              min={todayIso()}
              defaultValue={vehicle.permitExpiry ?? ''}
              onChange={(e) => onExpiryChange('Permit', 'permitExpiry', e.target.value)}
            />
          </div>
        </Card>

        {allRequiredDone ? (
          <StatusBanner tone="success" icon={<CheckCircle2 />} title="All required photos & papers are in. You can move on." />
        ) : (
          <p className="text-xs text-secondary">Still needed: {missing.map((s) => s).join(', ')}.</p>
        )}

        <Button variant="full" size="lg" onClick={() => navigate('/app/profile')}>Done</Button>
      </div>
    </div>
  );
}

export default VehiclePhotosPage;
