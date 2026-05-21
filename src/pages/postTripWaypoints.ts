import type { WaypointInput, TripType } from '@/types';
import type { WaypointDraft } from '@/components/trip/WaypointEditor';

export interface BuildWaypointArgs {
  tripType: TripType;
  fromCityId: string;
  toCityId: string;
  fromPlaceId?: string;
  toPlaceId?: string;
  /** ISO end timestamp (round-trip return / multi-way return-to-start anchor). */
  endIso?: string;
  /** Multi-way editor rows (ignored for one-way / round-trip). */
  multiWayRows: WaypointDraft[];
  returnToStart: boolean;
}

/**
 * Build the `waypoints[]` POST payload from the trip-post form state.
 *
 * Returns `undefined` for one-way trips — the server synthesises a 2-waypoint
 * plan from `from_*`/`to_*`, so no explicit waypoints are sent.
 *
 * IMPORTANT — round-trip turnaround carries NO `arriveAt`. The server enforces
 * strictly increasing `arrive_at` across waypoints, and the outbound leg's
 * natural arrival equals the trip pickup, so an `arriveAt:pickupIso` was rejected
 * with "arrive_at must be after the previous waypoint's time" — which broke EVERY
 * round-trip post (Qase D8/D9). Only the final return leg anchors the window via
 * `endIso`.
 */
export function buildWaypointInputs(args: BuildWaypointArgs): WaypointInput[] | undefined {
  const { tripType, fromCityId, toCityId, fromPlaceId, toPlaceId, endIso, multiWayRows, returnToStart } = args;

  if (tripType === 'round_trip') {
    return [
      { cityId: fromCityId, placeId: fromPlaceId },
      { cityId: toCityId, placeId: toPlaceId, waitMinutes: 0, isDestination: true },
      { cityId: fromCityId, placeId: fromPlaceId, arriveAt: endIso, waitMinutes: 0, isDestination: true },
    ];
  }

  if (tripType === 'multi_way') {
    const rows: WaypointInput[] = multiWayRows.map((w) => ({
      cityId: w.cityId,
      arriveAt: w.arriveAt ? new Date(w.arriveAt).toISOString() : undefined,
      waitMinutes: w.waitMinutes,
      isDestination: true,
      notes: w.notes.trim() || undefined,
    }));
    const list: WaypointInput[] = [{ cityId: fromCityId, placeId: fromPlaceId }, ...rows];
    if (returnToStart) list.push({ cityId: fromCityId, placeId: fromPlaceId, arriveAt: endIso, waitMinutes: 0, isDestination: true });
    return list;
  }

  return undefined;
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
