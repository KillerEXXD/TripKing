/**
 * `/vehicles/new` and `/vehicles/:id/edit` — step 3 of the driver "Get verified" checklist:
 * the vehicle's make / model / year / car type / seats / AC / fuel type / registration number.
 * Year is rejected inline if older than `app_settings.min_vehicle_year`. After adding a new
 * vehicle we go straight to its photos screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAddVehicle, useUpdateVehicle, useVehicle } from '@/hooks/useVehicles';
import { carTypeHooks, fuelTypeHooks, useAppSettings, useSeatOptions, useVehicleModelsForMake, vehicleMakeHooks } from '@/hooks/useAdminConfig';
import { Button, Card, Input } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { VehicleInput } from '@/types';

const selectClass = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-base';

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
      <button type="button" aria-label="Back" onClick={onBack} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <h1 className="text-base font-semibold">{title}</h1>
    </header>
  );
}

export function VehicleFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const vehicleQuery = useVehicle(editing ? id : undefined);
  const addVehicle = useAddVehicle();
  const updateVehicle = useUpdateVehicle();
  const carTypes = carTypeHooks.useList().data ?? [];
  const fuelTypes = fuelTypeHooks.useList().data ?? [];
  const makes = vehicleMakeHooks.useList().data ?? [];
  const seatOptions = useSeatOptions().data ?? [];
  const minYear = useAppSettings().data?.minVehicleYear ?? 2015;
  const thisYear = new Date().getFullYear();

  const [makeId, setMakeId] = useState('');
  const [modelId, setModelId] = useState('');
  const models = useVehicleModelsForMake(makeId || undefined).data ?? [];
  const [year, setYear] = useState<number | ''>('');
  const [carTypeId, setCarTypeId] = useState('');
  const [seats, setSeats] = useState<number | ''>('');
  const [ac, setAc] = useState(true);
  const [fuelTypeId, setFuelTypeId] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);

  useEffect(() => {
    if (!editing || !vehicleQuery.data) return;
    const v = vehicleQuery.data;
    setMakeId(v.makeId ?? '');
    setModelId(v.modelId ?? '');
    setYear(v.year);
    setCarTypeId(v.carTypeId);
    setSeats(v.seats);
    setAc(v.ac);
    setFuelTypeId(v.fuelTypeId ?? '');
    setRegistrationNumber(v.registrationNumber);
    setIsPrimary(v.isPrimary);
  }, [editing, vehicleQuery.data]);

  const yearOk = year !== '' && Number(year) >= minYear && Number(year) <= thisYear + 1;
  const ready = useMemo(
    () => yearOk && !!carTypeId && seats !== '' && registrationNumber.trim().length > 0 && !addVehicle.isPending && !updateVehicle.isPending,
    [yearOk, carTypeId, seats, registrationNumber, addVehicle.isPending, updateVehicle.isPending],
  );

  if (editing && vehicleQuery.isPending) return <div className="p-6"><LoadingSkeleton rows={6} /></div>;
  if (editing && (vehicleQuery.isError || !vehicleQuery.data)) return <div className="p-6"><ErrorState title="Couldn't load that vehicle" onRetry={() => vehicleQuery.refetch()} /></div>;

  async function onSubmit() {
    const input: VehicleInput = {
      makeId: makeId || null,
      modelId: modelId || null,
      year: Number(year),
      carTypeId,
      seats: Number(seats),
      ac,
      fuelTypeId: fuelTypeId || null,
      registrationNumber: registrationNumber.trim(),
      isPrimary,
    };
    try {
      if (editing && id) {
        await updateVehicle.mutateAsync({ id, patch: input });
        toast.success('Vehicle updated');
        navigate('/profile');
      } else {
        const created = await addVehicle.mutateAsync(input);
        toast.success('Vehicle added — now add its photos.');
        navigate(`/vehicles/${created.id}/photos`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the vehicle');
    }
  }

  return (
    <div>
      <Header onBack={() => navigate(-1)} title={editing ? 'Edit vehicle' : 'Add your vehicle'} />
      <div className="space-y-4 px-4 py-4">
        <Card className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="make" className="text-sm font-medium">Make</label>
              <select id="make" className={selectClass} value={makeId} onChange={(e) => { setMakeId(e.target.value); setModelId(''); }}>
                <option value="">— select —</option>
                {makes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="model" className="text-sm font-medium">Model</label>
              <select id="model" className={selectClass} value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!makeId}>
                <option value="">{makeId ? '— select —' : 'pick a make first'}</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="year" className="text-sm font-medium">Year<span className="text-destructive"> *</span></label>
              <Input id="year" inputMode="numeric" placeholder="2020" value={year === '' ? '' : String(year)} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setYear(Number.isFinite(n) && n > 0 ? n : ''); }} />
              {year !== '' && !yearOk && <p className="text-xs text-destructive">Must be {minYear} or newer{Number(year) > thisYear + 1 ? ' (and not a future year)' : ''}.</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ct" className="text-sm font-medium">Car type<span className="text-destructive"> *</span></label>
              <select id="ct" className={selectClass} value={carTypeId} onChange={(e) => setCarTypeId(e.target.value)}>
                <option value="">— select —</option>
                {carTypes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="seats" className="text-sm font-medium">Seats<span className="text-destructive"> *</span></label>
              <select id="seats" className={selectClass} value={seats === '' ? '' : String(seats)} onChange={(e) => setSeats(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— select —</option>
                {seatOptions.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fuel" className="text-sm font-medium">Fuel type</label>
              <select id="fuel" className={selectClass} value={fuelTypeId} onChange={(e) => setFuelTypeId(e.target.value)}>
                <option value="">— select —</option>
                {fuelTypes.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reg" className="text-sm font-medium">Registration number<span className="text-destructive"> *</span></label>
            <Input id="reg" placeholder="TN 09 AB 1234" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ac} onChange={(e) => setAc(e.target.checked)} /> Air-conditioned</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} /> This is my primary vehicle</label>
        </Card>
        <Button variant="full" size="lg" disabled={!ready} onClick={onSubmit}>
          {addVehicle.isPending || updateVehicle.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add vehicle & continue'}
        </Button>
      </div>
    </div>
  );
}

export default VehicleFormPage;
