import type { Trip, Waypoint } from '@/types';
import { shareVariant, VARIANT_LABEL, type ShareVariant } from '@/lib/share/tripShare';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Render a trip's route as a compact text chain:
 *   - one_way: "From → To"
 *   - round_trip: "From → Turnaround → From"
 *   - multi_way: every waypoint in order
 *
 * Falls back to `trip.fromCity.name → trip.toCity.name` for legacy trips whose
 * `waypoints` array is empty (pre-migration data, or a trip read with stripped joins).
 */
function nameOf(w: Waypoint): string {
  return w.place?.name ?? w.city?.name ?? '—';
}

export function routeChainText(trip: Trip): string {
  const wp = trip.waypoints ?? [];
  if (wp.length >= 2) return wp.map(nameOf).join(' → ');
  return `${trip.fromCity.name} → ${trip.toCity.name}`;
}

const VARIANT_VARIANT: Record<ShareVariant, 'muted' | 'info' | 'success' | 'warning'> = {
  one_way_drop: 'muted',
  round_trip_return: 'info',
  multi_way_drop: 'success',
  multi_way_return: 'warning',
};

export interface TripTypeBadgeProps {
  trip: Trip;
  className?: string;
}
/** Small Badge labelling the variant (matches the 🧭 line in the share caption). */
export function TripTypeBadge({ trip, className }: TripTypeBadgeProps) {
  const variant = shareVariant(trip);
  const label = VARIANT_LABEL[variant];
  // One-way is the common case — only badge when it's *not* one-way to keep cards tidy.
  if (variant === 'one_way_drop') return null;
  return (
    <Badge variant={VARIANT_VARIANT[variant]} className={cn(className)}>
      {label}
    </Badge>
  );
}

export interface RouteChainProps {
  trip: Trip;
  className?: string;
}
/** Compact text chain (single line). For multi-row detail rendering, build directly off `trip.waypoints`. */
export function RouteChain({ trip, className }: RouteChainProps) {
  return <span className={cn('truncate', className)}>{routeChainText(trip)}</span>;
}

export default RouteChain;
