import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { LoadingSkeleton } from '@/components/feedback';
import { useOverlappingApplications } from '@/hooks/useTrips';
import { cn, formatINR, formatPickupDateTime } from '@/lib/utils';
import type { MyApplication, Trip } from '@/types';

/**
 * Driver's Accept handshake — before flipping the current trip to `accepted`, surface
 * the other trips they've applied to that overlap this one's [pickup_at, expected_end_at].
 * Each row has a checkbox default-checked; the driver can uncheck to keep an application
 * alive (their call). On confirm, the selected ones are withdrawn server-side as part of
 * the accept transaction.
 *
 * Renders nothing until the overlap query resolves. If the list is empty, the dialog
 * auto-confirms and closes — no UX regression for the common case.
 */
export function AcceptTripDialog({
  trip,
  open,
  onClose,
  onConfirm,
  pending,
}: {
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onConfirm: (withdrawAcceptanceIds: string[]) => void;
  pending: boolean;
}) {
  const overlap = useOverlappingApplications(open ? trip.id : undefined, open);
  const overlapping = overlap.data ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Default-check every overlapping application when the list loads.
  useEffect(() => {
    if (overlap.isSuccess) {
      setChecked(new Set(overlapping.map((a) => a.acceptanceId)));
    }
  }, [overlap.isSuccess, overlapping]);

  // Empty-list short-circuit — no dialog, just confirm.
  useEffect(() => {
    if (open && overlap.isSuccess && overlapping.length === 0) {
      onConfirm([]);
    }
  }, [open, overlap.isSuccess, overlapping.length, onConfirm]);

  const checkedCount = checked.size;
  const confirmLabel = useMemo(() => {
    if (pending) return 'Accepting…';
    if (checkedCount === 0) return 'Accept';
    return `Accept · withdraw ${checkedCount} other${checkedCount === 1 ? '' : 's'}`;
  }, [checkedCount, pending]);

  if (!open) return null;
  if (overlap.isPending) {
    return (
      <Backdrop onClose={onClose}>
        <Header onClose={onClose} />
        <div className="p-4"><LoadingSkeleton rows={3} /></div>
      </Backdrop>
    );
  }
  // If we already short-circuited (no overlap), don't render any UI.
  if (overlap.isSuccess && overlapping.length === 0) return null;

  function toggle(id: string) {
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Backdrop onClose={onClose}>
      <Header onClose={onClose} />
      <div className="space-y-3 px-4 pb-4">
        <p className="text-sm text-secondary">
          You&apos;ve applied to {overlapping.length} other trip{overlapping.length === 1 ? '' : 's'} that overlap
          {' '}<b>{trip.fromCity?.name} → {trip.toCity?.name}</b>{' '}
          on {formatPickupDateTime(trip.pickupAt)}. We&apos;ll withdraw the checked ones automatically so the other
          agents can pick someone else.
        </p>
        <ul className="space-y-2">
          {overlapping.map((a) => (
            <OverlappingRow key={a.acceptanceId} app={a} checked={checked.has(a.acceptanceId)} onToggle={() => toggle(a.acceptanceId)} />
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={() => onConfirm(Array.from(checked))} disabled={pending}>
          {confirmLabel}
        </Button>
      </div>
    </Backdrop>
  );
}

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm acceptance" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        {children}
      </div>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 -z-10 cursor-default" />
    </div>
  );
}
function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="font-semibold">Accept this trip</div>
      <Button size="sm" variant="ghost" className="size-8 p-0" onClick={onClose} aria-label="Close"><X className="size-4" aria-hidden /></Button>
    </div>
  );
}

function OverlappingRow({ app, checked, onToggle }: { app: MyApplication; checked: boolean; onToggle: () => void }) {
  const t = app.trip;
  return (
    <li>
      <label className={cn('flex w-full cursor-pointer items-start gap-2 rounded-lg border p-2 text-left transition-colors', checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5 size-4 shrink-0" aria-label={`Withdraw application for ${t.fromCity?.name} → ${t.toCity?.name}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{t.fromCity?.name} → {t.toCity?.name}</div>
          <div className="text-xs text-secondary">
            Pickup {formatPickupDateTime(t.pickupAt)} · {formatINR(t.totalFare)} fare · status: <span className="font-medium">{app.status}</span>
          </div>
        </div>
      </label>
    </li>
  );
}
