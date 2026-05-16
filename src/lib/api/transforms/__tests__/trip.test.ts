import { describe, it, expect } from 'vitest';
import { TripTransformError, toApiPostTrip, transformTrip, transformTripAcceptance } from '@/lib/api/transforms/trip';
import type { PostTripInput } from '@/types';

const city = (id: string, name: string) => ({ id, name, state: 'Tamil Nadu', lat: 12.9, lng: 79.1, sort_order: 10, is_active: true });

const fullTrip = {
  id: 't1',
  posted_by_user_id: 'u1',
  posted_by_handle: 'A1B2C3D',
  posted_by_role: 'trip_manager',
  posted_by_name: 'Agent A',
  posted_by_phone: '+919999999999',
  from_city: city('c1', 'Vellore'),
  to_city: city('c2', 'Chennai'),
  pickup_at: '2026-06-01T08:00:00Z',
  expected_distance_km: 140,
  car_type_id: 'ct1',
  car_type: { label: 'Sedan' },
  seats_required: 4,
  ac_required: true,
  rate_per_km: 14,
  total_fare: 1960,
  commission_pct: 10,
  gst_amount: 98,
  driver_bata: 300,
  extras_paid_by_passenger: true,
  driver_instructions: '1. Call before arrival',
  driver_payout: 1966,
  passenger_name: 'Pax',
  passenger_phone: '+918888888888',
  passenger_count: 2,
  status: 'open',
  show_fare_to_passenger: true,
  hide_passenger_phone: false,
  applicant_count: 0,
  created_at: '2026-05-20T10:00:00Z',
};

describe('transformTrip', () => {
  it('maps a full trip with joined cities + car_type', () => {
    const t = transformTrip(fullTrip);
    expect(t.id).toBe('t1');
    expect(t.fromCity.name).toBe('Vellore');
    expect(t.toCity.name).toBe('Chennai');
    expect(t.carTypeLabel).toBe('Sedan');
    expect(t.driverPayout).toBe(1966);
    expect(t.status).toBe('open');
    expect(t.driverBata).toBe(300);
  });
  it('throws on missing id / from_city / total_fare / driver_payout / status', () => {
    expect(() => transformTrip({ ...fullTrip, id: undefined })).toThrow(TripTransformError);
    expect(() => transformTrip({ ...fullTrip, from_city: undefined })).toThrow(/MISSING_FROM_CITY/);
    expect(() => transformTrip({ ...fullTrip, total_fare: undefined })).toThrow(/MISSING_FARE/);
    expect(() => transformTrip({ ...fullTrip, driver_payout: undefined })).toThrow(/MISSING_PAYOUT/);
    expect(() => transformTrip({ ...fullTrip, status: undefined })).toThrow(/MISSING_STATUS/);
  });
  it('surfaces the assigned-driver join, distance-to-destination and the passenger OTP when present', () => {
    const t = transformTrip({
      ...fullTrip,
      status: 'in_progress',
      assigned_driver_id: 'd1',
      assigned_driver: { id: 'd1', display_handle: 'A1B2C3D', full_name: 'Ravi', phone: '+918888888888', profile_photo_url: '', rating_avg: 4.7, rating_count: 12, total_trips_completed: 30, current_lat: 12.97, current_lng: 79.16, current_location_at: '2026-06-01T10:30:00Z' },
      distance_to_destination_km: 42,
      passenger_otp: '123456',
    });
    expect(t.assignedDriver).toMatchObject({ id: 'd1', fullName: 'Ravi', displayHandle: 'A1B2C3D', phone: '+918888888888', currentLat: 12.97, currentLng: 79.16 });
    expect(t.distanceToDestinationKm).toBe(42);
    expect(t.passengerOtp).toBe('123456');
  });
  it('leaves the new fields undefined when the API omits them', () => {
    const t = transformTrip(fullTrip);
    expect(t.assignedDriver).toBeUndefined();
    expect(t.distanceToDestinationKm).toBeUndefined();
    expect(t.passengerOtp).toBeUndefined();
    expect(t.fromPlace).toBeUndefined();
    expect(t.toPlace).toBeUndefined();
    expect(t.distanceKm).toBeUndefined();
  });
  it('reads pending_invitation_count, defaulting to 0 when absent', () => {
    expect(transformTrip(fullTrip).pendingInvitationCount).toBe(0);
    expect(transformTrip({ ...fullTrip, pending_invitation_count: 3 }).pendingInvitationCount).toBe(3);
  });
  it('maps invitation_id + invitation_status when present (?invited=me rows), undefined otherwise', () => {
    const t0 = transformTrip(fullTrip);
    expect(t0.invitationId).toBeUndefined();
    expect(t0.invitationStatus).toBeUndefined();
    const t1 = transformTrip({ ...fullTrip, invitation_id: 'inv-1', invitation_status: 'pending' });
    expect(t1.invitationId).toBe('inv-1');
    expect(t1.invitationStatus).toBe('pending');
  });
  it('maps the joined from_place / to_place and a radius-list distance_km', () => {
    const t = transformTrip({
      ...fullTrip,
      from_place: { id: 'p1', provider: 'nominatim', provider_place_id: 'N1', name: 'Katpadi, Vellore', formatted_address: 'Katpadi, Vellore, India', state: 'Tamil Nadu', country: 'IN', lat: 12.9698, lng: 79.1336, is_active: true, created_at: '2026-05-20T00:00:00Z' },
      to_place: { id: 'p2', provider: 'nominatim', provider_place_id: 'N2', name: 'Tambaram', formatted_address: 'Tambaram, Chennai, India', state: 'Tamil Nadu', country: 'IN', lat: 12.9249, lng: 80.1, is_active: true, created_at: '2026-05-20T00:00:00Z' },
      distance_km: 3.5,
    });
    expect(t.fromPlace?.name).toBe('Katpadi, Vellore');
    expect(t.toPlace?.name).toBe('Tambaram');
    expect(t.distanceKm).toBe(3.5);
  });
  it('keeps the assigned driver but leaves the position fields undefined when the API sends them as null', () => {
    const t = transformTrip({
      ...fullTrip,
      status: 'accepted',
      assigned_driver_id: 'd1',
      assigned_driver: { id: 'd1', display_handle: 'A1B2C3D', full_name: 'Ravi', profile_photo_url: '', rating_avg: 4.7, rating_count: 12, total_trips_completed: 30, current_lat: null, current_lng: null, current_location_at: null },
    });
    expect(t.assignedDriver?.id).toBe('d1');
    expect(t.assignedDriver?.currentLat).toBeUndefined();
    expect(t.assignedDriver?.currentLng).toBeUndefined();
    expect(t.assignedDriver?.currentLocationAt).toBeUndefined();
    expect(t.distanceToDestinationKm).toBeUndefined();
  });
  it('passes the driver position + last-seen timestamp through for an in-progress trip', () => {
    const t = transformTrip({
      ...fullTrip,
      status: 'in_progress',
      assigned_driver_id: 'd1',
      assigned_driver: { id: 'd1', display_handle: 'A1B2C3D', full_name: 'Ravi', profile_photo_url: '', rating_avg: 4.7, rating_count: 12, total_trips_completed: 30, current_lat: 13.05, current_lng: 80.2, current_location_at: '2026-06-01T10:30:00Z' },
      distance_to_destination_km: 37.2,
    });
    expect(t.assignedDriver?.currentLat).toBe(13.05);
    expect(t.assignedDriver?.currentLng).toBe(80.2);
    expect(t.assignedDriver?.currentLocationAt).toBe('2026-06-01T10:30:00Z');
    expect(t.distanceToDestinationKm).toBe(37.2);
  });
  it('surfaces platform_fee_breakdown when present (Stage 3)', () => {
    const t = transformTrip({
      ...fullTrip,
      status: 'completed',
      platform_fee_breakdown: {
        driver: { amount_paise: 5000, payment_source: 'cash_wallet', status: 'charged' },
        agent: { amount_paise: 5000, payment_source: 'promo_credit', status: 'charged' },
      },
    });
    expect(t.platformFeeBreakdown?.driver).toEqual({ amountPaise: 5000, paymentSource: 'cash_wallet', status: 'charged' });
    expect(t.platformFeeBreakdown?.agent?.paymentSource).toBe('promo_credit');
  });
  it('platform_fee_breakdown returns undefined when absent / empty', () => {
    expect(transformTrip(fullTrip).platformFeeBreakdown).toBeUndefined();
    expect(transformTrip({ ...fullTrip, platform_fee_breakdown: {} }).platformFeeBreakdown).toBeUndefined();
  });
});

describe('transformTripAcceptance', () => {
  const acc = {
    id: 'a1',
    trip_id: 't1',
    driver_id: 'd1',
    driver: { id: 'd1', full_name: 'Ravi', profile_photo_url: '', rating_avg: 4.8, rating_count: 12, total_trips_completed: 30, top_tags: ['Punctual'], current_city: city('c1', 'Vellore') },
    vehicle_id: 'v1',
    vehicle: { id: 'v1', make: { name: 'Toyota' }, model: { name: 'Innova Crysta' }, year: 2021, car_type: { label: 'Innova' }, seats: 7, ac: true },
    status: 'applied',
    applicant_quoted_rate_per_km: 13.5,
    applied_at: '2026-05-21T09:00:00Z',
  };
  it('maps an acceptance with embedded driver + vehicle', () => {
    const a = transformTripAcceptance(acc);
    expect(a.driver.fullName).toBe('Ravi');
    expect(a.driver.currentCity?.name).toBe('Vellore');
    expect(a.vehicle?.makeLabel).toBe('Toyota');
    expect(a.vehicle?.carTypeLabel).toBe('Innova');
    expect(a.applicantQuotedRatePerKm).toBe(13.5);
  });
  it('throws when the embedded driver is missing', () => {
    expect(() => transformTripAcceptance({ ...acc, driver: undefined })).toThrow(/no driver/i);
  });
});

describe('toApiPostTrip', () => {
  it('converts camelCase → snake_case', () => {
    const input: PostTripInput = {
      fromCityId: 'c1',
      toCityId: 'c2',
      pickupAt: '2026-06-01T08:00:00Z',
      expectedDistanceKm: 140,
      carTypeId: 'ct1',
      seatsRequired: 4,
      acRequired: true,
      ratePerKm: 14,
      totalFare: 1960,
      commissionPct: 10,
      gstAmount: 98,
      driverBata: 300,
      extrasPaidByPassenger: true,
      passengerName: 'Pax',
      passengerPhone: '+91',
      passengerCount: 2,
      showFareToPassenger: true,
      hidePassengerPhone: false,
    };
    expect(toApiPostTrip(input)).toMatchObject({
      from_city_id: 'c1',
      to_city_id: 'c2',
      from_place_id: null,
      to_place_id: null,
      pickup_at: '2026-06-01T08:00:00Z',
      car_type_id: 'ct1',
      rate_per_km: 14,
      total_fare: 1960,
      driver_bata: 300,
      extras_paid_by_passenger: true,
      show_fare_to_passenger: true,
      driver_instructions: null,
    });
    expect(toApiPostTrip({ ...input, fromPlaceId: 'p1', toPlaceId: 'p2' })).toMatchObject({ from_place_id: 'p1', to_place_id: 'p2' });
  });
});
