import { describe, it, expect } from 'vitest';
import { VehicleTransformError, toApiVehicle, transformVehicle } from '@/lib/api/transforms/vehicle';
import { ReviewTransformError, toApiReview, transformNotification, transformReview } from '@/lib/api/transforms/review';
import type { ReviewInput, VehicleInput } from '@/types';

describe('transformVehicle', () => {
  it('maps a vehicle with joined make/model/car_type/fuel_type + eligibility', () => {
    const v = transformVehicle({
      id: 'v1',
      driver_id: 'd1',
      make: { name: 'Toyota' },
      model: { name: 'Innova Crysta' },
      year: 2021,
      car_type_id: 'ct1',
      car_type: { label: 'Innova' },
      seats: 7,
      ac: true,
      fuel_type: { label: 'Diesel' },
      registration_number: 'TN 22 AB 1234',
      eligibility_status: 'eligible',
      is_primary: true,
      is_active: true,
    });
    expect(v.makeLabel).toBe('Toyota');
    expect(v.modelName).toBe('Innova Crysta');
    expect(v.carTypeLabel).toBe('Innova');
    expect(v.fuelTypeLabel).toBe('Diesel');
    expect(v.eligibilityStatus).toBe('eligible');
    expect(v.isPrimary).toBe(true);
  });
  it('throws on missing id / driver_id / year / car_type_id', () => {
    expect(() => transformVehicle({ driver_id: 'd1', year: 2021, car_type_id: 'ct1' })).toThrow(VehicleTransformError);
    expect(() => transformVehicle({ id: 'v', year: 2021, car_type_id: 'ct1' })).toThrow(/MISSING_DRIVER_ID/);
    expect(() => transformVehicle({ id: 'v', driver_id: 'd1', car_type_id: 'ct1' })).toThrow(/MISSING_YEAR/);
    expect(() => transformVehicle({ id: 'v', driver_id: 'd1', year: 2021 })).toThrow(/MISSING_CAR_TYPE/);
  });
});

describe('transformReview', () => {
  it('maps a review and clamps role to passenger when unknown', () => {
    const r = transformReview({ id: 'r1', trip_id: 't1', direction: 'passenger_to_driver', score: 5, comment: 'Great', tag_ids: ['tg1'], is_published: true });
    expect(r.score).toBe(5);
    expect(r.raterRole).toBe('passenger');
    expect(r.tagIds).toEqual(['tg1']);
  });
  it('throws on missing id/trip_id, bad direction, bad score', () => {
    expect(() => transformReview({ trip_id: 't1', direction: 'passenger_to_driver', score: 5 })).toThrow(ReviewTransformError);
    expect(() => transformReview({ id: 'r', direction: 'passenger_to_driver', score: 5 })).toThrow(/no trip_id/);
    expect(() => transformReview({ id: 'r', trip_id: 't1', direction: 'sideways', score: 5 })).toThrow(/bad review direction/);
    expect(() => transformReview({ id: 'r', trip_id: 't1', direction: 'passenger_to_driver', score: 7 })).toThrow(/bad review score/);
  });
});

describe('transformNotification', () => {
  it('maps a notification', () => {
    const n = transformNotification({ id: 'n1', user_id: 'u1', display_handle: 'A1B2C3D', type: 'trip_assigned', title: 'Assigned', body: 'You got the trip', payload_json: { tripId: 't1' }, is_read: false });
    expect(n.type).toBe('trip_assigned');
    expect(n.payloadJson).toEqual({ tripId: 't1' });
  });
  it('accepts referral + withdrawal + trip_updated types', () => {
    const types = [
      'trip_updated',
      'referral_signup', 'referral_verified', 'referral_qualified', 'referral_first_eligible_trip',
      'referral_earning', 'referral_released', 'referral_cap_reached',
      'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_paid',
    ] as const;
    for (const t of types) {
      expect(transformNotification({ id: `n-${t}`, user_id: 'u1', type: t, title: 'x', body: 'y' }).type).toBe(t);
    }
  });
  it('coerces an unknown type to "unknown" instead of throwing (forward-compat)', () => {
    const n = transformNotification({ id: 'n', user_id: 'u1', type: 'brand_new_server_event', title: 'x', body: 'y' });
    expect(n.type).toBe('unknown');
    expect(n.title).toBe('x');
  });
  it('throws on missing id/user_id', () => {
    expect(() => transformNotification({ user_id: 'u1', type: 'trip_assigned' })).toThrow(/no id/);
    expect(() => transformNotification({ id: 'n', type: 'trip_assigned' })).toThrow(/user_id/);
  });
});

describe('toApi* writers', () => {
  it('toApiVehicle maps camelCase → snake_case, drops undefined', () => {
    const input: Partial<VehicleInput> = { year: 2022, carTypeId: 'ct1', seats: 4, ac: false, registrationNumber: 'TN 01 AA 1' };
    expect(toApiVehicle(input)).toEqual({ year: 2022, car_type_id: 'ct1', seats: 4, ac: false, registration_number: 'TN 01 AA 1' });
  });
  it('toApiReview', () => {
    const input: ReviewInput = { tripId: 't1', rateeUserId: 'u2', direction: 'manager_to_driver', score: 4, comment: 'Good', tagIds: ['tg1'] };
    expect(toApiReview(input)).toEqual({ trip_id: 't1', ratee_user_id: 'u2', direction: 'manager_to_driver', score: 4, comment: 'Good', tag_ids: ['tg1'] });
  });
});
