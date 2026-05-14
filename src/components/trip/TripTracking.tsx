import { Car, Clock, ExternalLink, MapPin, Navigation } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn, etaLabel, formatKm } from '@/lib/utils';
import type { Trip } from '@/types';
function freshness(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 30) return 'just now';
  if (s < 90) return 'about a minute ago';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86_400)} d ago`;
}
function mapsDirLink(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}`;
}

/**
 * Live-tracking panel for an assigned / in-progress trip — a route schematic
 * with a car marker, the ETA to the drop-off, distance remaining, the driver's
 * last reported position, and a "Open in Google Maps" directions link. Driver
 * position + `distanceToDestinationKm` come straight from the API (no client
 * computation of state); the ETA is a rough estimate at {@link ASSUMED_KMH}.
 * Renders nothing unless the trip is `assigned`/`in_progress`.
 */
export function TripTracking({ trip }: { trip: Trip }) {
  if (trip.status !== 'accepted' && trip.status !== 'in_progress') return null;
  const d = trip.assignedDriver;
  const hasPosition = d && typeof d.currentLat === 'number' && typeof d.currentLng === 'number';
  const inProgress = trip.status === 'in_progress';
  const kmRemaining = typeof trip.distanceToDestinationKm === 'number' ? trip.distanceToDestinationKm : undefined;
  const fraction = inProgress && kmRemaining != null && trip.expectedDistanceKm > 0 ? Math.min(0.98, Math.max(0.02, 1 - kmRemaining / trip.expectedDistanceKm)) : 0.02;
  // Multi-day "Day N of M" — only renders when the trip span is ≥2 days and it's already in_progress.
  // `dayN` clamps to the trip span so "Day 4 of 3" is impossible if the driver overran.
  const totalDays = (() => {
    if (!trip.expectedEndAt) return 1;
    const start = new Date(trip.pickupAt).getTime();
    const end = new Date(trip.expectedEndAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
    return Math.max(1, Math.ceil((end - start) / 86_400_000));
  })();
  const dayN = inProgress && totalDays > 1 ? Math.min(totalDays, Math.max(1, Math.ceil((Date.now() - new Date(trip.pickupAt).getTime()) / 86_400_000))) : 1;
  const showMultiDay = inProgress && totalDays > 1;

  return (
    <Card className="gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold">
          <Navigation className="size-4 text-emerald-600" aria-hidden /> Live tracking
        </div>
        <div className="flex items-center gap-2">
          {showMultiDay ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              Day {dayN} of {totalDays}
            </span>
          ) : null}
          <span className="text-xs text-secondary">{inProgress ? 'On the way' : 'Driver confirmed'}</span>
        </div>
      </div>

      <div>
        <div className="relative h-1.5 rounded-full bg-gray-200">
          <div className="absolute left-0 top-0 h-full rounded-full bg-emerald-500" style={{ width: `${fraction * 100}%` }} />
          <div className="absolute -top-3 -translate-x-1/2 transition-[left] duration-700 ease-linear" style={{ left: `${fraction * 100}%` }}>
            <span className="block rounded-full bg-emerald-600 p-1.5 text-white shadow ring-2 ring-white [&_svg]:size-3.5">
              <Car aria-hidden />
            </span>
          </div>
          <span className="absolute -left-1 -top-1 size-3.5 rounded-full bg-gray-400 ring-2 ring-white" aria-hidden />
          <span className="absolute -right-1 -top-1 size-3.5 rounded-full bg-emerald-700 ring-2 ring-white" aria-hidden />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-medium">{trip.fromCity.name}</span>
          {inProgress && kmRemaining != null ? <span className="text-secondary">{Math.round(fraction * 100)}% of the way</span> : null}
          <span className="font-medium">{trip.toCity.name}</span>
        </div>
      </div>

      {inProgress && kmRemaining != null ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-secondary">Estimated time to your stop</div>
            <div className="flex items-center gap-1 text-base font-semibold">
              <Clock className="size-4 text-emerald-600" aria-hidden /> {etaLabel(kmRemaining)}
            </div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-secondary">Distance remaining</div>
            <div className="flex items-center gap-1 text-base font-semibold">
              <MapPin className="size-4 text-emerald-600" aria-hidden /> {formatKm(Math.round(kmRemaining))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-secondary">{inProgress ? "Waiting for the driver's location…" : "Your driver is confirmed — you'll see them move here once the trip starts."}</p>
      )}

      <div className={cn('flex items-center justify-between text-xs', hasPosition ? 'text-secondary' : 'text-secondary/70')}>
        {hasPosition ? (
          <span>
            Driver at {d!.currentLat!.toFixed(4)}, {d!.currentLng!.toFixed(4)}
            {freshness(d!.currentLocationAt) ? ` · updated ${freshness(d!.currentLocationAt)}` : ''}
          </span>
        ) : (
          <span>Driver location not shared yet</span>
        )}
        {hasPosition ? (
          <a href={mapsDirLink(d!.currentLat!, d!.currentLng!, trip.toCity.lat, trip.toCity.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald-700">
            Open in Maps <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>
    </Card>
  );
}

export default TripTracking;
