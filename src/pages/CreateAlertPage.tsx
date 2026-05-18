import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { toast } from 'sonner';
import { useCreateAlert } from '@/hooks/useAlerts';
import { carTypeHooks, cityHooks, useAppSettings } from '@/hooks/useAdminConfig';
import { PlacePinField } from '@/components/location/PlacePinField';
import { BellRing, Car } from 'lucide-react';
import { Button, Card, Input, SectionLabel } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { AlertInput, NotifyChannel, Place } from '@/types';

const CHANNELS: { value: NotifyChannel; label: string }[] = [
  { value: 'in_app', label: 'In-app' },
  { value: 'push', label: 'Push' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];
const selectClass = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-base';

function FlowHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <PageHeader title={title} onBack={onBack} />;
}

/**
 * `/app/alerts/new` — create a saved-search alert. Pickup city + radius are required;
 * destination, min ₹/km, car types and notify channels are optional. Dropdowns
 * come from `useAdminConfig`; the default radius from app-settings. On success
 * we go back to the alerts list.
 */
export function CreateAlertPage() {
  const navigate = useNavigate();
  const createAlert = useCreateAlert();
  const citiesQuery = cityHooks.useList();
  const carTypesQuery = carTypeHooks.useList();
  const appSettings = useAppSettings();

  const [name, setName] = useState('');
  const [fromCityId, setFromCityId] = useState('');
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [fromRadiusKm, setFromRadiusKm] = useState<number | ''>('');
  const [toCityId, setToCityId] = useState('');
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [minRatePerKm, setMinRatePerKm] = useState<number | ''>('');
  const [carTypeIds, setCarTypeIds] = useState<string[]>([]);
  const [notifyVia, setNotifyVia] = useState<NotifyChannel[]>(['in_app']);

  function toggleCarType(id: string) {
    setCarTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleChannel(c: NotifyChannel) {
    setNotifyVia((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  const defaultRadius = appSettings.data?.defaultAlertRadiusKm ?? 25;
  const effectiveRadius = fromRadiusKm === '' ? defaultRadius : Math.max(1, Math.round(Number(fromRadiusKm)));
  const canSubmit = fromCityId.length > 0 && notifyVia.length > 0 && !createAlert.isPending;

  async function onSubmit() {
    if (!fromCityId) {
      toast.error('Pick a pickup city for the alert');
      return;
    }
    if (notifyVia.length === 0) {
      toast.error('Pick at least one notification channel');
      return;
    }
    const input: AlertInput = {
      name: name.trim() || `${fromPlace?.name ?? citiesQuery.data?.find((c) => c.id === fromCityId)?.name ?? 'Trips'} alert`,
      fromCityId,
      fromPlaceId: fromPlace?.id ?? null,
      fromRadiusKm: effectiveRadius,
      toCityId: toCityId || null,
      toPlaceId: toPlace?.id ?? null,
      minRatePerKm: minRatePerKm === '' ? null : Math.max(0, Number(minRatePerKm)),
      carTypeIds: carTypeIds.length ? carTypeIds : undefined,
      notifyVia,
      isActive: true,
    };
    try {
      await createAlert.mutateAsync(input);
      toast.success('Alert created');
      navigate('/app/alerts');
    } catch {
      toast.error("Couldn't create the alert — try again.");
    }
  }

  if (citiesQuery.isPending || carTypesQuery.isPending) {
    return (
      <div className="mx-auto max-w-md">
        <FlowHeader title="New alert" onBack={() => navigate('/app/alerts')} />
        <div className="p-4">
          <LoadingSkeleton rows={5} />
        </div>
      </div>
    );
  }
  if (citiesQuery.isError || carTypesQuery.isError) {
    return (
      <div className="mx-auto max-w-md">
        <FlowHeader title="New alert" onBack={() => navigate('/app/alerts')} />
        <div className="p-4">
          <ErrorState title="Couldn't load the form" message="We need the city + car-type lists to create an alert." onRetry={() => { void citiesQuery.refetch(); void carTypesQuery.refetch(); }} />
        </div>
      </div>
    );
  }

  const cities = citiesQuery.data ?? [];
  const carTypes = (carTypesQuery.data ?? []).filter((c) => c.isActive);

  return (
    <div className="mx-auto max-w-md">
      <FlowHeader title="New alert" onBack={() => navigate('/app/alerts')} />
      <div className="space-y-3 p-4">
      <Card className="gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Alert name (optional)</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vellore → Chennai" />
        </label>
        <div className="space-y-1.5">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Pickup city</span>
            <select className={selectClass} value={fromCityId} onChange={(e) => setFromCityId(e.target.value)}>
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <PlacePinField value={fromPlace} onChange={setFromPlace} pinLabel="Pin the exact pickup point" pickerTitle="Pickup location" />
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Pickup radius (km) <span className="font-normal text-secondary">— default {defaultRadius}</span>
          </span>
          <Input type="number" min={1} step={1} inputMode="numeric" value={fromRadiusKm} onChange={(e) => setFromRadiusKm(e.target.value === '' ? '' : Number(e.target.value))} placeholder={String(defaultRadius)} />
        </label>
        <div className="space-y-1.5">
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Destination city <span className="font-normal text-secondary">(optional)</span>
            </span>
            <select className={selectClass} value={toCityId} onChange={(e) => setToCityId(e.target.value)}>
              <option value="">Any destination</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <PlacePinField value={toPlace} onChange={setToPlace} pinLabel="Pin the exact destination" pickerTitle="Destination location" />
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Minimum ₹ per km <span className="font-normal text-secondary">(optional)</span>
          </span>
          <Input type="number" min={0} step={1} inputMode="numeric" value={minRatePerKm} onChange={(e) => setMinRatePerKm(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 14" />
        </label>
      </Card>

      <Card className="gap-2">
        <SectionLabel icon={<Car />} accent="green">Car Types <span className="font-normal text-secondary">(optional — any if none picked)</span></SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {carTypes.map((ct) => {
            const active = carTypeIds.includes(ct.id);
            return (
              <button
                key={ct.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCarType(ct.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background hover:border-primary/40'}`}
              >
                {ct.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="gap-2">
        <SectionLabel icon={<BellRing />} accent="green">Notify Me Via</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((ch) => (
            <label key={ch.value} className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={notifyVia.includes(ch.value)} onChange={() => toggleChannel(ch.value)} /> {ch.label}
            </label>
          ))}
        </div>
      </Card>

      {createAlert.isError ? <p className="text-sm text-red-700">Couldn&apos;t create the alert — please try again.</p> : null}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => navigate('/app/alerts')} disabled={createAlert.isPending}>
          Cancel
        </Button>
        <Button type="button" variant="full" onClick={() => void onSubmit()} disabled={!canSubmit}>
          {createAlert.isPending ? 'Creating…' : 'Create alert'}
        </Button>
      </div>
      </div>
    </div>
  );
}

export default CreateAlertPage;
