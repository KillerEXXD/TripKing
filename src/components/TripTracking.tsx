import { useState, useEffect } from 'react';
import { Navigation, Clock, MapPin, ExternalLink, Car } from 'lucide-react';
import type { Trip } from '@/types';
import { getTripTracking, directionsLink } from '@/lib/tripTracking';
import { Badge } from '@/components/ui/badge';

interface Props {
  trip: Trip;
  variant?: 'summary' | 'full';
}

export function TripTracking({ trip, variant = 'full' }: Props) {
  const t = getTripTracking(trip);

  // Gentle "creep" so the car icon visibly moves a touch while the manager watches.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 4000);
    return () => clearInterval(id);
  }, []);

  if (!t) return null;

  // nudge progress by up to +3% over time, capped at 0.97
  const displayFraction = Math.min(0.97, t.progressFraction + Math.min(0.03, tick * 0.005));

  if (variant === 'summary') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Clock className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">Time to reach destination:</span>
        <span className="font-medium">{t.etaLabel}</span>
        <Badge variant={t.onTime ? 'success' : 'warning'}>{t.statusLabel}</Badge>
      </div>
    );
  }

  // FULL variant — route schematic + ETA + maps link
  return (
    <div className="rounded-xl border bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Navigation className="size-4 text-emerald-600" />
          Live Tracking
        </div>
        <Badge variant={t.onTime ? 'success' : 'warning'}>{t.statusLabel}</Badge>
      </div>

      {/* Route schematic: from ──●(car)── to */}
      <div className="pt-2 pb-1">
        <div className="relative h-1.5 rounded-full bg-gray-200">
          {/* completed portion */}
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-emerald-500"
            style={{ width: `${displayFraction * 100}%` }}
          />
          {/* car marker */}
          <div
            className="absolute -top-3 -translate-x-1/2 transition-[left] duration-1000 ease-linear"
            style={{ left: `${displayFraction * 100}%` }}
          >
            <div className="rounded-full bg-emerald-600 text-white p-1.5 shadow ring-2 ring-white">
              <Car className="size-3.5" />
            </div>
          </div>
          {/* origin / destination dots */}
          <div className="absolute -left-1 -top-1 size-3.5 rounded-full bg-gray-400 ring-2 ring-white" />
          <div className="absolute -right-1 -top-1 size-3.5 rounded-full bg-emerald-700 ring-2 ring-white" />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-medium">{trip.fromCity.name}</span>
          <span className="text-muted-foreground">{Math.round(displayFraction * 100)}% complete</span>
          <span className="font-medium">{trip.toCity.name}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="text-xs text-muted-foreground">Time to reach destination</div>
          <div className="font-semibold text-base flex items-center gap-1">
            <Clock className="size-4 text-emerald-600" /> {t.etaLabel}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="text-xs text-muted-foreground">Distance remaining</div>
          <div className="font-semibold text-base flex items-center gap-1">
            <MapPin className="size-4 text-emerald-600" /> {t.kmRemaining} km
          </div>
        </div>
      </div>

      {/* Current coords + open in maps */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Current: {t.currentLat.toFixed(4)}, {t.currentLng.toFixed(4)}
        </span>
        <a
          href={directionsLink(t.currentLat, t.currentLng, trip.toCity.lat, trip.toCity.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-emerald-700 font-medium"
        >
          Open in Maps <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}
