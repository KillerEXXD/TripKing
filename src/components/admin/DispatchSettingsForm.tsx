import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import type { AppSettings, AppSettingsInput, DispatchAlgorithm } from '@/types';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAdminConfig';
import { Button, Input } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';

type TunableKey =
  | 'dispatchOfferSeconds'
  | 'dispatchOfflineGraceSeconds'
  | 'dispatchInitialRadiusKm'
  | 'dispatchRadiusWidenKm'
  | 'dispatchMaxPasses'
  | 'dispatchRetryCooldownSeconds'
  | 'dispatchMaxRetries'
  | 'dispatchHeartbeatStaleSeconds';

const TUNABLES: { key: TunableKey; label: string; min: number; max: number; hint?: string }[] = [
  { key: 'dispatchOfferSeconds', label: 'Offer window (seconds)', min: 15, max: 300, hint: 'How long each driver has to ACCEPT before the offer advances to the next.' },
  { key: 'dispatchOfflineGraceSeconds', label: 'Offline grace (seconds)', min: 30, max: 1800, hint: 'How long a driver keeps their queue place after going offline.' },
  { key: 'dispatchInitialRadiusKm', label: 'Initial search radius (km)', min: 1, max: 100, hint: 'How close a driver must be to a pickup to be offered the trip first.' },
  { key: 'dispatchRadiusWidenKm', label: 'Radius widen step (km)', min: 0, max: 100, hint: 'How much wider to search each round when nobody nearby accepts.' },
  { key: 'dispatchMaxPasses', label: 'Max widening passes', min: 1, max: 5, hint: 'How many times to widen the radius before a cooldown.' },
  { key: 'dispatchRetryCooldownSeconds', label: 'Retry cooldown (seconds)', min: 30, max: 3600, hint: 'How long to wait before auto-retrying an exhausted trip.' },
  { key: 'dispatchMaxRetries', label: 'Max retries', min: 0, max: 20, hint: 'How many retry cycles before the trip is marked Unfilled.' },
  { key: 'dispatchHeartbeatStaleSeconds', label: 'Heartbeat stale (seconds)', min: 30, max: 600, hint: 'No GPS for this long ⇒ the driver is treated as offline.' },
];

/**
 * The platform Dispatch settings: the algorithm toggle (Auto ⇄ Manual — a
 * high-impact, confirm-guarded LIVE switch) plus the Auto-dispatch tuning knobs
 * (draft + Save). Both write to the single `app_settings` row; every change is
 * audit-logged server-side. The flip drains gracefully — in-flight trips finish
 * in the mode they were posted under.
 */
export function DispatchSettingsForm() {
  const query = useAppSettings();
  const update = useUpdateAppSettings();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [confirmTo, setConfirmTo] = useState<DispatchAlgorithm | null>(null);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  if (query.isPending || !draft) return <LoadingSkeleton rows={5} />;
  if (query.isError) return <ErrorState title="Couldn't load dispatch settings" onRetry={() => void query.refetch()} />;

  const d = draft;
  const algorithm = query.data?.dispatchAlgorithm ?? d.dispatchAlgorithm;

  function patch(part: Partial<AppSettings>) {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev));
  }

  function applyAlgorithm(to: DispatchAlgorithm) {
    setConfirmTo(null);
    update.mutate(
      { dispatchAlgorithm: to } satisfies AppSettingsInput,
      {
        onSuccess: () => toast.success(to === 'auto' ? 'Switched to Auto-dispatch' : 'Switched to Manual dispatch'),
        onError: () => toast.error("Couldn't switch the dispatch algorithm"),
      },
    );
  }

  function saveTunables() {
    const patchBody: AppSettingsInput = {
      dispatchOfferSeconds: d.dispatchOfferSeconds,
      dispatchOfflineGraceSeconds: d.dispatchOfflineGraceSeconds,
      dispatchInitialRadiusKm: d.dispatchInitialRadiusKm,
      dispatchRadiusWidenKm: d.dispatchRadiusWidenKm,
      dispatchMaxPasses: d.dispatchMaxPasses,
      dispatchRetryCooldownSeconds: d.dispatchRetryCooldownSeconds,
      dispatchMaxRetries: d.dispatchMaxRetries,
      dispatchHeartbeatStaleSeconds: d.dispatchHeartbeatStaleSeconds,
    };
    update.mutate(patchBody, {
      onSuccess: () => toast.success('Dispatch settings saved'),
      onError: () => toast.error("Couldn't save dispatch settings"),
    });
  }

  return (
    <section className="space-y-5" aria-labelledby="dispatch-settings-heading">
      <h2 id="dispatch-settings-heading" className="text-lg font-semibold">
        Dispatch
      </h2>

      {/* Algorithm toggle — live, confirm-guarded. */}
      <div className="rounded-xl border p-4">
        <div className="text-sm font-medium">Platform dispatch algorithm</div>
        <p className="mt-1 text-xs text-secondary">
          <b>Auto</b> — drivers go &quot;I&apos;m Online&quot; and trips are auto-offered to the nearest driver, 60s each.
          {' '}<b>Manual</b> — drivers post &quot;I&apos;m vacant&quot; / apply and agents pick. Switching only affects new
          trips; in-flight trips finish in their current mode.
        </p>
        <div className="mt-3 inline-flex rounded-full bg-black/5 p-0.5" role="group" aria-label="Dispatch algorithm">
          {(['manual', 'auto'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => (opt === algorithm ? undefined : setConfirmTo(opt))}
              aria-pressed={algorithm === opt}
              disabled={update.isPending}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                algorithm === opt ? 'bg-black text-white shadow-sm' : 'text-secondary hover:text-foreground'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-secondary">
          Currently live: <b className="capitalize">{algorithm}</b>
        </p>
      </div>

      {/* Auto-dispatch tunables — draft + Save. */}
      <div>
        <div className="text-sm font-medium">Auto-dispatch tuning</div>
        <p className="mt-0.5 text-xs text-secondary">Used when the algorithm is Auto. Safe to edit any time.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {TUNABLES.map((f) => (
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
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={saveTunables} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={() => query.data && setDraft(query.data)} disabled={update.isPending}>
            Reset
          </Button>
        </div>
      </div>

      {confirmTo ? (
        <AlgorithmConfirm to={confirmTo} pending={update.isPending} onCancel={() => setConfirmTo(null)} onConfirm={() => applyAlgorithm(confirmTo)} />
      ) : null}
    </section>
  );
}

function AlgorithmConfirm({
  to,
  pending,
  onCancel,
  onConfirm,
}: {
  to: DispatchAlgorithm;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm dispatch algorithm change" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold">Switch to {to === 'auto' ? 'Auto-dispatch' : 'Manual dispatch'}?</div>
          <Button size="sm" variant="ghost" className="size-8 p-0" onClick={onCancel} aria-label="Close"><X className="size-4" aria-hidden /></Button>
        </div>
        <div className="space-y-2 px-4 py-3 text-sm text-secondary">
          {to === 'auto' ? (
            <p>
              Drivers will switch to <b>&quot;I&apos;m Online&quot;</b> and new trips will be <b>auto-offered</b> to the
              nearest online drivers (no applicants, no manual picking). In-flight manual trips finish as-is. Make sure
              QA has been briefed before enabling this.
            </p>
          ) : (
            <p>
              Drivers will go back to <b>&quot;I&apos;m vacant&quot; + apply</b> and agents will <b>pick</b> applicants
              again. In-flight auto trips finish as-is. This reverts the platform to today&apos;s behaviour.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onConfirm} disabled={pending} autoFocus>
            {pending ? 'Switching…' : to === 'auto' ? 'Enable Auto-dispatch' : 'Revert to Manual'}
          </Button>
        </div>
      </div>
      <button type="button" aria-label="Close" onClick={onCancel} className="absolute inset-0 -z-10 cursor-default" />
    </div>
  );
}

export default DispatchSettingsForm;
