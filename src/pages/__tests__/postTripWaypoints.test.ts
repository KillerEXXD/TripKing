import { describe, it, expect } from 'vitest';
import { buildWaypointInputs, editUpdateToastMessage } from '@/pages/postTripWaypoints';
import type { WaypointDraft } from '@/components/trip/WaypointEditor';

const END = '2099-06-01T18:00:00.000Z';
const stop = (over: Partial<WaypointDraft> = {}): WaypointDraft => ({ uid: `w-${Math.random()}`, cityId: '', placeId: '', place: null, arriveAt: '', waitMinutes: 0, notes: '', ...over });
const base = { fromCityId: 'c1', toCityId: 'c2', endIso: END } as const;

describe('buildWaypointInputs', () => {
  it('package returns undefined — the server builds the pickup-only plan', () => {
    expect(buildWaypointInputs({ ...base, category: 'package', direction: 'one_way', stops: [] })).toBeUndefined();
  });

  it('outstation one-way with no stops returns undefined (server synthesises the 2-waypoint plan)', () => {
    expect(buildWaypointInputs({ ...base, category: 'outstation', direction: 'one_way', stops: [] })).toBeUndefined();
  });

  it('outstation one-way with stops builds origin → stops → destination', () => {
    const wp = buildWaypointInputs({ ...base, category: 'outstation', direction: 'one_way', fromPlaceId: 'p1', toPlaceId: 'p2', stops: [stop({ cityId: 'cX', waitMinutes: 20, notes: ' tea ' })] });
    expect(wp).toHaveLength(3);
    expect(wp![0]).toMatchObject({ cityId: 'c1', placeId: 'p1' });
    expect(wp![1]).toMatchObject({ cityId: 'cX', waitMinutes: 20, notes: 'tea', isDestination: true });
    expect(wp![2]).toMatchObject({ cityId: 'c2', placeId: 'p2', isDestination: true });
  });

  it('round-trip locks To=From and anchors the return leg to endIso; intermediate stops carry no return-arriveAt', () => {
    const wp = buildWaypointInputs({
      category: 'outstation', direction: 'round_trip',
      fromCityId: 'c1', toCityId: 'c1', fromPlaceId: 'p1', returnPlaceId: 'pr', endIso: END,
      stops: [stop({ cityId: 'c2', waitMinutes: 360 }), stop({ cityId: 'c3' })],
    });
    expect(wp).toHaveLength(4); // origin + 2 stops + return
    expect(wp![0]).toMatchObject({ cityId: 'c1', placeId: 'p1' });
    expect(wp![0].arriveAt).toBeUndefined();
    expect(wp![1]).toMatchObject({ cityId: 'c2', isDestination: true });
    // Return leg: same city as origin, the separate return pin, anchored to the end time.
    expect(wp![3]).toMatchObject({ cityId: 'c1', placeId: 'pr', isDestination: true, arriveAt: END });
  });

  it('local with no stops returns undefined (server derives the city from the place)', () => {
    expect(buildWaypointInputs({ ...base, category: 'local', direction: 'one_way', fromPlaceId: 'p1', toPlaceId: 'p2', stops: [] })).toBeUndefined();
  });

  it('local with stops builds a place-only chain origin → stops → destination', () => {
    const wp = buildWaypointInputs({ ...base, category: 'local', direction: 'one_way', fromPlaceId: 'p1', toPlaceId: 'p2', stops: [stop({ placeId: 'ps', notes: 'gate 3' })] });
    expect(wp).toHaveLength(3);
    expect(wp![0]).toMatchObject({ placeId: 'p1' });
    expect(wp![0].cityId).toBeUndefined();
    expect(wp![1]).toMatchObject({ placeId: 'ps', isDestination: true, notes: 'gate 3' });
    expect(wp![2]).toMatchObject({ placeId: 'p2', isDestination: true });
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
