import { describe, it, expect } from 'vitest';
import {
  AdminConfigTransformError,
  toApiAppSettings,
  toApiLookup,
  toApiMake,
  transformAppSettings,
  transformCancelReason,
  transformCity,
  transformLanguage,
  transformLookup,
  transformReviewTag,
  transformSeatOption,
  transformVehicleModel,
} from '@/lib/api/transforms/adminConfig';

describe('transformLookup', () => {
  it('maps a car-type/fuel-type row (label)', () => {
    expect(transformLookup({ id: 'c1', label: 'Sedan', sort_order: 20, is_active: true })).toEqual({
      id: 'c1',
      label: 'Sedan',
      sortOrder: 20,
      isActive: true,
    });
  });
  it('normalises a vehicle-make row `name` → `label`', () => {
    expect(transformLookup({ id: 'm1', name: 'Toyota', sort_order: 40 })).toEqual({ id: 'm1', label: 'Toyota', sortOrder: 40, isActive: true });
  });
  it('defaults sort_order→0 and is_active→true; treats is_active:false as inactive', () => {
    expect(transformLookup({ id: 'x', label: 'X' })).toEqual({ id: 'x', label: 'X', sortOrder: 0, isActive: true });
    expect(transformLookup({ id: 'x', label: 'X', is_active: false }).isActive).toBe(false);
  });
  it('throws on missing id / label', () => {
    expect(() => transformLookup({ label: 'X' })).toThrow(AdminConfigTransformError);
    expect(() => transformLookup({ id: 'x' })).toThrow(/no label\/name/);
  });
});

describe('transformReviewTag', () => {
  it('maps a tag and keeps a valid sentiment', () => {
    expect(transformReviewTag({ id: 't', label: 'Punctual', category: 'manager_to_driver', sentiment: 'positive', sort_order: 10 })).toEqual({
      id: 't',
      label: 'Punctual',
      category: 'manager_to_driver',
      sentiment: 'positive',
      sortOrder: 10,
      isActive: true,
    });
  });
  it('throws on an unknown category', () => {
    try {
      transformReviewTag({ id: 't', label: 'x', category: 'driver_to_passenger' });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AdminConfigTransformError);
      expect((e as AdminConfigTransformError).code).toBe('BAD_VALUE');
    }
  });
});

describe('transformCancelReason / City / Language / VehicleModel / SeatOption', () => {
  it('cancel reason', () => {
    expect(transformCancelReason({ id: 'r', label: 'Fare dispute', applies_to: 'both', sort_order: 20 })).toEqual({
      id: 'r',
      label: 'Fare dispute',
      appliesTo: 'both',
      sortOrder: 20,
      isActive: true,
    });
    expect(() => transformCancelReason({ id: 'r', label: 'x', applies_to: 'nobody' })).toThrow(/bad cancel-reason/);
  });
  it('city — requires name/state/lat/lng', () => {
    expect(transformCity({ id: 'c', name: 'Vellore', state: 'Tamil Nadu', lat: 12.9165, lng: 79.1325, sort_order: 10 })).toMatchObject({
      name: 'Vellore',
      lat: 12.9165,
      lng: 79.1325,
    });
    expect(() => transformCity({ id: 'c', name: 'Vellore', state: 'TN', lat: 12 })).toThrow(/no lng/);
  });
  it('language — requires code/native_name/english_name', () => {
    expect(transformLanguage({ code: 'ta', native_name: 'தமிழ்', english_name: 'Tamil', display_order: 20 })).toEqual({
      code: 'ta',
      nativeName: 'தமிழ்',
      englishName: 'Tamil',
      displayOrder: 20,
      isActive: true,
    });
    expect(() => transformLanguage({ code: 'ta', native_name: 'தமிழ்' })).toThrow(/no english_name/);
  });
  it('vehicle model — requires make_id + name; carries optional defaults', () => {
    expect(transformVehicleModel({ id: 'vm', make_id: 'mk', name: 'Innova Crysta', default_seats: 7, sort_order: 30 })).toMatchObject({
      makeId: 'mk',
      name: 'Innova Crysta',
      defaultSeats: 7,
      defaultCarTypeId: undefined,
    });
    expect(() => transformVehicleModel({ id: 'vm', name: 'X' })).toThrow(/no make_id/);
  });
  it('seat option', () => {
    expect(transformSeatOption({ value: 7, is_active: true })).toEqual({ value: 7, isActive: true });
    expect(() => transformSeatOption({ is_active: true })).toThrow(/no value/);
  });
});

describe('transformAppSettings', () => {
  const full = {
    min_vehicle_year: 2015,
    vehicle_expiry_warning_days: 90,
    default_alert_radius_km: 25,
    default_commission_pct: 10,
    default_gst_amount: 100,
    default_driver_bata: 300,
    default_extras_paid_by_passenger: true,
    default_driver_instructions: '1. Call before arrival',
    max_active_vacancies_per_driver: 2,
    invite_max_radius_km: 15,
    dispatch_algorithm: 'auto',
    dispatch_offer_seconds: 60,
    dispatch_offline_grace_seconds: 180,
    dispatch_initial_radius_km: 3,
    dispatch_radius_widen_km: 10,
    dispatch_max_passes: 2,
    dispatch_retry_cooldown_seconds: 120,
    dispatch_max_retries: 3,
    dispatch_heartbeat_stale_seconds: 90,
  };
  it('maps a full row', () => {
    expect(transformAppSettings(full)).toEqual({
      minVehicleYear: 2015,
      vehicleExpiryWarningDays: 90,
      defaultAlertRadiusKm: 25,
      defaultCommissionPct: 10,
      defaultGstAmount: 100,
      defaultDriverBata: 300,
      defaultExtrasPaidByPassenger: true,
      defaultDriverInstructions: '1. Call before arrival',
      maxActiveVacanciesPerDriver: 2,
      inviteMaxRadiusKm: 15,
      dispatchAlgorithm: 'auto',
      dispatchOfferSeconds: 60,
      dispatchOfflineGraceSeconds: 180,
      dispatchInitialRadiusKm: 3,
      dispatchRadiusWidenKm: 10,
      dispatchMaxPasses: 2,
      dispatchRetryCooldownSeconds: 120,
      dispatchMaxRetries: 3,
      dispatchHeartbeatStaleSeconds: 90,
    });
  });
  it('defaults dispatch_algorithm to manual when absent/invalid', () => {
    expect(transformAppSettings({ ...full, dispatch_algorithm: undefined }).dispatchAlgorithm).toBe('manual');
    expect(transformAppSettings({ ...full, dispatch_algorithm: 'bogus' }).dispatchAlgorithm).toBe('manual');
  });
  it('throws when a numeric setting is missing', () => {
    const { min_vehicle_year: _omit, ...rest } = full;
    expect(() => transformAppSettings(rest)).toThrow(/no min_vehicle_year/);
  });
  it('throws when max_active_vacancies_per_driver is missing', () => {
    const { max_active_vacancies_per_driver: _omit, ...rest } = full;
    expect(() => transformAppSettings(rest)).toThrow(/no max_active_vacancies_per_driver/);
  });
});

describe('toApi* writers — camelCase → snake_case, drop undefined', () => {
  it('toApiLookup', () => {
    expect(toApiLookup({ label: 'SUV', sortOrder: 30 })).toEqual({ label: 'SUV', sort_order: 30 });
    expect(toApiLookup({ isActive: false })).toEqual({ is_active: false });
    expect(toApiLookup({})).toEqual({});
  });
  it('toApiMake sends `name`', () => {
    expect(toApiMake({ label: 'Kia', sortOrder: 70 })).toEqual({ name: 'Kia', sort_order: 70 });
  });
  it('toApiAppSettings', () => {
    expect(toApiAppSettings({ minVehicleYear: 2016, defaultCommissionPct: 12 })).toEqual({ min_vehicle_year: 2016, default_commission_pct: 12 });
    expect(toApiAppSettings({ maxActiveVacanciesPerDriver: 3 })).toEqual({ max_active_vacancies_per_driver: 3 });
    expect(toApiAppSettings({ inviteMaxRadiusKm: 20 })).toEqual({ invite_max_radius_km: 20 });
    expect(toApiAppSettings({ dispatchAlgorithm: 'auto' })).toEqual({ dispatch_algorithm: 'auto' });
    expect(toApiAppSettings({ dispatchOfferSeconds: 45, dispatchMaxRetries: 5 })).toEqual({ dispatch_offer_seconds: 45, dispatch_max_retries: 5 });
  });
});
