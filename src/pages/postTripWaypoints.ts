import type { WaypointInput, TripCategory } from '@/types';
import type { WaypointDraft } from '@/components/trip/WaypointEditor';
import type { TripDirection } from '@/components/trip/TripDirectionToggle';

export interface BuildWaypointArgs {
  category: TripCategory;
  /** Outstation only; Local is always one_way, Package has no direction. */
  direction: TripDirection;
  /** Outstation city endpoints. */
  fromCityId: string;
  toCityId: string;
  /** Optional pinned exact points (Outstation) / required addresses (Local). */
  fromPlaceId?: string;
  toPlaceId?: string;
  /** Outstation round-trip: a separate "return drop-off" pin (the return city is always From). */
  returnPlaceId?: string;
  /** ISO end timestamp — anchors the round-trip return leg. */
  endIso?: string;
  /** Intermediate stops (city-mode for Outstation, address-mode for Local). */
  stops: WaypointDraft[];
}

const stopArrive = (s: WaypointDraft): string | undefined => (s.arriveAt ? new Date(s.arriveAt).toISOString() : undefined);

/**
 * Build the `waypoints[]` POST payload from the trip-post form state (migration 071 model).
 *
 * Returns `undefined` when no explicit waypoints are needed — the server then synthesises a
 * 2-waypoint plan from `from_*`/`to_*` (Outstation one-way with no stops, or Local with no
 * stops where it derives the city from the place). Package also returns `undefined`: the
 * server builds the pickup-only plan from `from_place_id` + `package_*`.
 *
 * IMPORTANT — the round-trip return leg carries NO `arriveAt` on the outbound legs (the server
 * enforces strictly increasing `arrive_at`); only the final return leg anchors the window via
 * `endIso` (Qase D8/D9 — an `arriveAt:pickupIso` on the outbound leg broke every round trip).
 */
export function buildWaypointInputs(args: BuildWaypointArgs): WaypointInput[] | undefined {
  const { category, direction, fromCityId, toCityId, fromPlaceId, toPlaceId, returnPlaceId, endIso, stops } = args;

  if (category === 'package') return undefined;

  if (category === 'local') {
    if (stops.length === 0) return undefined; // server synthesises from from_place_id/to_place_id
    return [
      { placeId: fromPlaceId },
      ...stops.map((s) => ({ placeId: s.placeId, arriveAt: stopArrive(s), waitMinutes: s.waitMinutes, isDestination: true, notes: s.notes.trim() || undefined })),
      { placeId: toPlaceId, isDestination: true },
    ];
  }

  // Outstation
  if (direction === 'round_trip') {
    return [
      { cityId: fromCityId, placeId: fromPlaceId },
      ...stops.map((s) => ({ cityId: s.cityId, arriveAt: stopArrive(s), waitMinutes: s.waitMinutes, isDestination: true, notes: s.notes.trim() || undefined })),
      { cityId: fromCityId, placeId: returnPlaceId ?? fromPlaceId, arriveAt: endIso, waitMinutes: 0, isDestination: true },
    ];
  }

  // Outstation one-way
  if (stops.length === 0) return undefined; // legacy 2-waypoint synth from from/to city
  return [
    { cityId: fromCityId, placeId: fromPlaceId },
    ...stops.map((s) => ({ cityId: s.cityId, arriveAt: stopArrive(s), waitMinutes: s.waitMinutes, isDestination: true, notes: s.notes.trim() || undefined })),
    { cityId: toCityId, placeId: toPlaceId, isDestination: true },
  ];
}

/**
 * Success-toast copy after an agent saves a trip edit. Always states the notification
 * outcome explicitly (Qase D14/D15/D17) — a bare "Trip updated" reads as "no one was
 * told". The server fans out `trip_updated` to applicants + pending invitees on PATCH;
 * this just describes what that meant.
 */
export function editUpdateToastMessage(recipientCount: number, changeCount: number): string {
  if (recipientCount > 0 && changeCount > 0) {
    return `Trip updated — ${recipientCount} applicant${recipientCount === 1 ? '' : 's'} notified of the changes.`;
  }
  if (recipientCount === 0) {
    return 'Trip updated. No applicants yet — no one needed to be notified.';
  }
  return 'Trip updated.';
}
