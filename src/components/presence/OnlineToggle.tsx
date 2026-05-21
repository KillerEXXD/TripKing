import { useEffect, useState } from 'react';
import { Power, Radar, WifiOff, Car } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { usePresence, useGoOnline, useGoOffline, useHeartbeat } from '@/hooks/usePresence';
import { useDriverVehicles } from '@/hooks/useVehicles';
import { ApiError } from '@/lib/api/client';
import type { Vehicle } from '@/types';

interface Props {
  driverId: string;
}

function vehicleLabel(v: Vehicle): string {
  const name = [v.makeLabel, v.modelName].filter(Boolean).join(' ');
  return [name || 'Vehicle', v.registrationNumber].filter(Boolean).join(' · ');
}

/** mm:ss remaining until `iso`, or 0 once elapsed. */
function useCountdown(iso: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [iso]);
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
}

/**
 * The driver's "I'm Online" control for Auto-dispatch — replaces the "I'm vacant"
 * card on the home screen when the platform algorithm is `auto`. Three states:
 * online (in the queue, getting offers), grace (just went offline — a countdown to
 * keep your place), offline. Going online grabs a one-shot GPS fix; while online a
 * background heartbeat keeps the position fresh.
 */
export function OnlineToggle({ driverId }: Props) {
  const presence = usePresence();
  const goOnline = useGoOnline();
  const goOffline = useGoOffline();
  const vehiclesQuery = useDriverVehicles(driverId);

  const status = presence.data?.status ?? 'offline';
  const busy = !!presence.data?.busyTripId;
  useHeartbeat(status === 'online' && !busy);

  const vehicles = (vehiclesQuery.data ?? []).filter((v) => v.isActive !== false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  // Default to the driver's primary (or first) vehicle once they load.
  useEffect(() => {
    if (vehicleId || vehicles.length === 0) return;
    setVehicleId((vehicles.find((v) => v.isPrimary) ?? vehicles[0]).id);
  }, [vehicleId, vehicles]);

  const graceLeft = useCountdown(status === 'grace' ? presence.data?.graceExpiresAt ?? null : null);

  function handleGoOnline() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Location isn’t available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        goOnline.mutate(
          { lat: pos.coords.latitude, lng: pos.coords.longitude, vehicleId },
          {
            onSuccess: () => toast.success('You’re online — finding trips near you.'),
            onError: (e) => {
              if (e instanceof ApiError && e.code === 'KYC_REQUIRED') toast.error('Finish KYC verification to go online.');
              else if (e instanceof ApiError && e.status === 403) toast.error('Your account can’t go online right now.');
              else toast.error('Couldn’t go online — please try again.');
            },
          },
        );
      },
      () => toast.error('Turn on location to go online.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function handleGoOffline() {
    goOffline.mutate(undefined, {
      onSuccess: () => toast('You’re going offline.'),
      onError: () => toast.error('Couldn’t go offline — please try again.'),
    });
  }

  const pending = goOnline.isPending || goOffline.isPending;
  const tone =
    status === 'online' ? 'border-emerald-300 bg-emerald-50' : status === 'grace' ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-slate-50';

  return (
    <div className="mx-4 mb-3 mt-3" data-testid="online-toggle">
      <div className={`overflow-hidden rounded-2xl border-2 ${tone}`}>
        <div className="flex items-start gap-3 p-4">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              status === 'online' ? 'bg-emerald-100 text-emerald-700' : status === 'grace' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
            }`}
            aria-hidden
          >
            {status === 'online' ? <Radar className="size-5" /> : status === 'grace' ? <Power className="size-5" /> : <WifiOff className="size-5" />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">
              {status === 'online' ? 'You’re Online' : status === 'grace' ? 'Going offline…' : 'You’re Offline'}
            </div>

            {busy ? (
              <p className="mt-0.5 text-xs text-secondary">On a trip — you’ll re-join the queue with a fresh number when it’s done.</p>
            ) : status === 'online' ? (
              <p className="mt-0.5 text-xs text-emerald-800">In the queue — trips near you will pop up to accept.</p>
            ) : status === 'grace' ? (
              <p className="mt-0.5 text-xs text-amber-800">
                Come back within <span className="font-semibold tabular-nums">{Math.floor(graceLeft / 60)}:{String(graceLeft % 60).padStart(2, '0')}</span> to keep your place in the queue.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-secondary">Switch on to join the queue and get trip offers.</p>
            )}

            {/* Vehicle picker — only when offline/grace and the driver has >1 active vehicle. */}
            {status !== 'online' && !busy && vehicles.length > 1 ? (
              <label className="mt-2 flex items-center gap-2 text-xs">
                <Car className="size-4 text-secondary" aria-hidden />
                <select
                  aria-label="Vehicle to go online with"
                  value={vehicleId ?? ''}
                  onChange={(e) => setVehicleId(e.target.value || null)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {!busy ? (
              <div className="mt-3">
                {status === 'online' ? (
                  <Button size="sm" variant="outline" onClick={handleGoOffline} disabled={pending}>
                    <Power className="size-4" aria-hidden /> Go Offline
                  </Button>
                ) : (
                  <Button size="sm" variant="default" onClick={handleGoOnline} disabled={pending}>
                    <Power className="size-4" aria-hidden /> {status === 'grace' ? 'I’m back online' : 'Go Online'}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnlineToggle;
