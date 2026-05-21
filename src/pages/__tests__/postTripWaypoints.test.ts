import { describe, it, expect } from 'vitest';
import { buildWaypointInputs, editUpdateToastMessage } from '@/pages/postTripWaypoints';
import type { WaypointDraft } from '@/components/trip/WaypointEditor';

const END = '2099-06-01T18:00:00.000Z';

describe('buildWaypointInputs', () => {
  it('returns undefined for one-way (server synthesises the 2-waypoint plan)', () => {
    expect(
      buildWaypointInputs({ tripType: 'one_way', fromCityId: 'c1', toCityId: 'c2', endIso: END, multiWayRows: [], returnToStart: false }),
    ).toBeUndefined();
  });

  it('round-trip turnaround carries NO arriveAt — regression for Qase D8/D9 (was =pickup → 422)', () => {
    const wp = buildWaypointInputs({
      tripType: 'round_trip',
      fromCityId: 'c1',
      toCityId: 'c2',
      fromPlaceId: 'p1',
      toPlaceId: 'p2',
      endIso: END,
      multiWayRows: [],
      returnToStart: false,
    });
    expect(wp).toHaveLength(3);
    // Origin: no arriveAt.
    expect(wp![0]).toMatchObject({ cityId: 'c1', placeId: 'p1' });
    expect(wp![0].arriveAt).toBeUndefined();
    // Turnaround: MUST NOT carry arriveAt — the server rejects arrive_at <= previous.
    expect(wp![1]).toMatchObject({ cityId: 'c2', placeId: 'p2', isDestination: true });
    expect(wp![1].arriveAt).toBeUndefined();
    // Return leg: anchored to the trip's end time.
    expect(wp![2]).toMatchObject({ cityId: 'c1', placeId: 'p1', isDestination: true, arriveAt: END });
  });

  it('multi-way maps editor rows and appends the return leg only when returnToStart is set', () => {
    const rows: WaypointDraft[] = [
      { uid: 'w1', cityId: 'c2', arriveAt: '', waitMinutes: 30, notes: ' lunch ' },
      { uid: 'w2', cityId: 'c3', arriveAt: '2099-06-01T14:00', waitMinutes: 0, notes: '' },
    ];
    const noReturn = buildWaypointInputs({ tripType: 'multi_way', fromCityId: 'c1', toCityId: 'c3', endIso: END, multiWayRows: rows, returnToStart: false });
    expect(noReturn).toHaveLength(3); // origin + 2 stops
    expect(noReturn![1]).toMatchObject({ cityId: 'c2', waitMinutes: 30, notes: 'lunch', isDestination: true });
    expect(noReturn![1].arriveAt).toBeUndefined(); // empty string → no arriveAt
    expect(noReturn![2].arriveAt).toBe(new Date('2099-06-01T14:00').toISOString());

    const withReturn = buildWaypointInputs({ tripType: 'multi_way', fromCityId: 'c1', toCityId: 'c1', endIso: END, multiWayRows: rows, returnToStart: true });
    expect(withReturn).toHaveLength(4);
    expect(withReturn![3]).toMatchObject({ cityId: 'c1', arriveAt: END, isDestination: true });
  });
});

describe('editUpdateToastMessage (Qase D14/D15/D17)', () => {
  it('0 recipients → explicit "no one needed to be notified"', () => {
    expect(editUpdateToastMessage(0, 0)).toMatch(/no applicants yet — no one needed to be notified/i);
    expect(editUpdateToastMessage(0, 3)).toMatch(/no applicants yet/i);
  });
  it('>=1 recipient with changes → states how many were notified', () => {
    expect(editUpdateToastMessage(1, 2)).toBe('Trip updated — 1 applicant notified of the changes.');
    expect(editUpdateToastMessage(3, 1)).toBe('Trip updated — 3 applicants notified of the changes.');
  });
  it('>=1 recipient but no notify-worthy change → plain "Trip updated."', () => {
    expect(editUpdateToastMessage(2, 0)).toBe('Trip updated.');
  });
});
