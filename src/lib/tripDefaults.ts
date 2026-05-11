import type { Trip } from '@/types';

/** Flat bata that goes directly to the driver, on top of the fare. */
export const DEFAULT_DRIVER_BATA = 300;

/** Standard driver instructions pre-filled on the Post Trip form. The poster
 *  can edit these freely before publishing. */
export const DEFAULT_DRIVER_INSTRUCTIONS_LINES = [
  'Call customer before arrival',
  'Reach 10 mins early',
  'Follow Google Maps route',
];
export const DEFAULT_DRIVER_INSTRUCTIONS = DEFAULT_DRIVER_INSTRUCTIONS_LINES.join('\n');

/** Bata (₹) for a trip — defaults to ₹300 for trips posted before the field existed. */
export function tripDriverBata(trip: Pick<Trip, 'driverBata'>): number {
  return typeof trip.driverBata === 'number' ? trip.driverBata : DEFAULT_DRIVER_BATA;
}

/** Driver instructions as a clean list of lines. */
export function tripDriverInstructions(trip: Pick<Trip, 'driverInstructions'>): string[] {
  const raw = trip.driverInstructions ?? DEFAULT_DRIVER_INSTRUCTIONS;
  return raw
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

/** True when packing / toll / permit charges are extra, paid by the passenger.
 *  Defaults to true for trips posted before the field existed. */
export function tripExtrasPaidByPassenger(
  trip: Pick<Trip, 'extrasPaidByPassenger'>,
): boolean {
  return trip.extrasPaidByPassenger ?? true;
}

/** Commission amount (₹) on the base fare. */
export function tripCommissionAmount(trip: Pick<Trip, 'totalFare' | 'commissionPct'>): number {
  return Math.round((trip.totalFare * trip.commissionPct) / 100);
}

/** The driver's expected take: base fare − commission − GST + bata. */
export function tripApproxDriverCost(
  trip: Pick<Trip, 'totalFare' | 'commissionPct' | 'gstAmount' | 'driverBata'>,
): number {
  return Math.max(0, trip.totalFare - tripCommissionAmount(trip) - trip.gstAmount) + tripDriverBata(trip);
}
