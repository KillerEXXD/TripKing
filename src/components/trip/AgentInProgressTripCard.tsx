import { Link } from 'react-router-dom';
import { ChevronRight, Clock, Phone, User } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { etaLabel, formatINR, formatKm, formatKmAndDuration, initials } from '@/lib/utils';
import type { Trip } from '@/types';

/**
 * Agent's view of a trip that's currently `in_progress` — surfaces the driver name +
 * tap-to-call phone, the passenger name, the car / seats / AC summary, the fare, and a
 * rough ETA based on `distanceToDestinationKm` (the redactor returns this only to the
 * trip's poster + admin — see `redactTrip` `rel='owner'` branch).
 *
 * The whole card is a link to the full trip detail; the phone number is a `tel:` anchor
 * with `stopPropagation` so tapping the call icon doesn't navigate.
 */
export function AgentInProgressTripCard({ trip }: { trip: Trip }) {
  const driver = trip.assignedDriver;
  const driverName = driver?.fullName ?? driver?.displayHandle ?? 'Driver';
  const driverPhone = driver?.phone ?? null;
  const eta = trip.distanceToDestinationKm != null ? etaLabel(trip.distanceToDestinationKm) : null;
  const carLine = [trip.carTypeLabel, `${trip.seatsRequired} seat${trip.seatsRequired === 1 ? '' : 's'}`, trip.acRequired ? 'AC' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card className="gap-0 border-emerald-200 bg-emerald-50/40 p-0">
      <Link to={`/app/trips/${trip.id}`} className="block space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
            <div className="truncate text-xs text-secondary">
              {formatKmAndDuration(trip.expectedDistanceKm)} · {formatINR(trip.totalFare)} fare
            </div>
          </div>
          <Badge variant="info" className="shrink-0">In progress</Badge>
        </div>

        {eta ? (
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-900">
            <Clock className="size-3.5" aria-hidden /> ETA {eta}
            <span className="text-emerald-700">· {formatKm(trip.distanceToDestinationKm!)} to destination</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2.5 rounded-md border bg-white px-2.5 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-primary/10 text-xs font-bold text-primary">
            {driver?.profilePhotoUrl ? (
              <img src={driver.profilePhotoUrl} alt="" className="size-full object-cover" />
            ) : (
              <span>{initials(driverName)}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{driverName}</div>
            <div className="truncate text-[11px] text-secondary">{carLine || 'Vehicle details unavailable'}</div>
          </div>
          {driverPhone ? (
            <a
              href={`tel:${driverPhone}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Call ${driverName} on ${driverPhone}`}
              className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              <Phone className="size-3.5" aria-hidden /> Call
            </a>
          ) : null}
        </div>

        {trip.passengerName ? (
          <div className="flex items-center gap-1.5 text-xs text-secondary">
            <User className="size-3.5" aria-hidden /> Passenger: <span className="font-semibold text-foreground">{trip.passengerName}</span>
            {typeof trip.passengerCount === 'number' && trip.passengerCount > 1 ? <span>· {trip.passengerCount} pax</span> : null}
          </div>
        ) : null}
      </Link>
      <div className="flex items-center justify-end border-t px-4 py-2.5 text-xs font-semibold">
        <Link to={`/app/trips/${trip.id}`} className="flex items-center text-primary">
          View full trip <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export default AgentInProgressTripCard;
