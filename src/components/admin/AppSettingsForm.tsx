import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AppSettings } from '@/types';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAdminConfig';
import { Button, Input } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';

type NumericKey =
  | 'minVehicleYear'
  | 'vehicleExpiryWarningDays'
  | 'defaultAlertRadiusKm'
  | 'defaultCommissionPct'
  | 'defaultGstAmount'
  | 'defaultDriverBata'
  | 'maxActiveVacanciesPerDriver'
  | 'inviteMaxRadiusKm';

const NUMERIC_FIELDS: { key: NumericKey; label: string; min?: number; max?: number; hint?: string }[] = [
  { key: 'minVehicleYear', label: 'Minimum vehicle year', min: 2000, hint: 'Vehicles older than this are rejected at registration and become ineligible.' },
  { key: 'vehicleExpiryWarningDays', label: 'Expiry warning window (days)', min: 1, hint: 'When to start warning drivers (90 / 30 / 7-day reminders).' },
  { key: 'defaultAlertRadiusKm', label: 'Default alert radius (km)', min: 1 },
  { key: 'defaultCommissionPct', label: 'Default commission %', min: 0, max: 30, hint: 'Pre-fills the Post-a-trip form.' },
  { key: 'defaultGstAmount', label: 'Default GST (₹)', min: 0, hint: 'Flat rupee amount per trip (NOT a percentage). Pre-fills the Post-a-trip form.' },
  { key: 'defaultDriverBata', label: 'Default driver bata (₹ / day)', min: 0, hint: 'Per-day amount. Multi-day trips multiply this by the day count automatically.' },
  { key: 'maxActiveVacanciesPerDriver', label: 'Max active "I\'m available" posts per driver', min: 1, max: 10, hint: 'Soft enforcement — lowering this doesn\'t cancel existing posts; only new posts see the new ceiling.' },
  { key: 'inviteMaxRadiusKm', label: 'Invite radius from driver vacancy (km)', min: 1, max: 200, hint: 'When an agent invites a driver from that driver\'s "I\'m available" post, the trip\'s pickup must be within this many km of the vacancy\'s announced city.' },
];

/** Single-row platform config — the 8 `app_settings` fields. */
export function AppSettingsForm() {
  const query = useAppSettings();
  const update = useUpdateAppSettings();
  const [draft, setDraft] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  if (query.isPending || !draft) return <LoadingSkeleton rows={5} />;
  if (query.isError) return <ErrorState title="Couldn't load settings" onRetry={() => void query.refetch()} />;

  const d = draft;
  function patch(part: Partial<AppSettings>) {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev));
  }

  return (
    <section className="space-y-4" aria-labelledby="general-settings-heading">
      <h2 id="general-settings-heading" className="text-lg font-semibold">
        General settings
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {NUMERIC_FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="font-medium">{f.label}</span>
            <Input
              type="number"
              min={f.min}
              max={f.max}
              value={String(d[f.key])}
              onChange={(e) => patch({ [f.key]: Number(e.target.value) } as Partial<AppSettings>)}
              className="mt-1"
            />
            {f.hint ? <span className="mt-1 block text-xs text-secondary">{f.hint}</span> : null}
          </label>
        ))}
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={d.defaultExtrasPaidByPassenger}
            onChange={(e) => patch({ defaultExtrasPaidByPassenger: e.target.checked })}
          />
          <span className="font-medium">Packing / toll / permit extras are paid by the passenger (default on new trips)</span>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">Default driver instructions</span>
          <textarea
            className="mt-1 w-full rounded-lg border p-2 text-sm"
            rows={4}
            value={d.defaultDriverInstructions}
            onChange={(e) => patch({ defaultDriverInstructions: e.target.value })}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() =>
            update.mutate(d, {
              onSuccess: () => toast.success('Settings saved'),
              onError: () => toast.error("Couldn't save settings"),
            })
          }
          disabled={update.isPending}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={() => query.data && setDraft(query.data)} disabled={update.isPending}>
          Reset
        </Button>
      </div>
    </section>
  );
}

export default AppSettingsForm;
