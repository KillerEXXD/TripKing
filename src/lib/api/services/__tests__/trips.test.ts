import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import * as transforms from '@/lib/api/transforms/trip';
import {
  applyToTrip,
  assignDriver,
  cancelTrip,
  completeTrip,
  getEndOdoUploadUrl,
  getMyApplications,
  getStartOdoUploadUrl,
  getTrip,
  getTripApplicants,
  getTripByOtp,
  getTrips,
  postTrip,
  rejectApplicant,
  startTrip,
  updateTripDetails,
  updateTripPassenger,
  withdrawApplication,
} from '@/lib/api/services/trips';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(transforms, 'transformTrip').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
  vi.spyOn(transforms, 'transformTripAcceptance').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
  vi.spyOn(transforms, 'transformMyApplication').mockImplementation((row: unknown) => ({ trip: { id: (row as { id: string }).id } } as never));
  vi.spyOn(transforms, 'toApiPostTrip').mockImplementation(() => ({ stub: true }) as never);
});

describe('trips service', () => {
  it('getTrips → GET /trips with snake_case query params from camelCase input', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 't1' }]) as never);
    await getTrips({ status: 'open', fromCityId: 'c1', toCityId: 'c2', postedByUserId: 'u1', near: { lat: 13, lng: 80, radiusKm: 25 }, page: 2, limit: 10, sort: 'pickup_at' });
    expect(get).toHaveBeenCalledWith('/trips', { status: 'open', from_city_id: 'c1', to_city_id: 'c2', posted_by_user_id: 'u1', near_lat: 13, near_lng: 80, radius_km: 25, page: 2, limit: 10, sort: 'pickup_at' });
  });

  it('getTrips joins array status with comma; omits query entirely when no params', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await getTrips({ status: ['open', 'has_applicants'] });
    expect(get).toHaveBeenLastCalledWith('/trips', { status: 'open,has_applicants' });
    await getTrips();
    expect(get).toHaveBeenLastCalledWith('/trips', undefined);
  });

  it('getMyApplications → GET /trips/applied', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'a1' }]) as never);
    const apps = await getMyApplications();
    expect(get).toHaveBeenCalledWith('/trips/applied');
    expect(apps).toHaveLength(1);
  });

  it('getTrip throws EmptyResponseError on null body', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(null) as never);
    await expect(getTrip('t1')).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it('getTripByOtp coerces null fare/payout fields to 0 and URL-encodes the OTP', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ id: 't1', total_fare: null, rate_per_km: null, driver_payout: null, driver_bata: null }) as never);
    await getTripByOtp('12 34');
    expect(get).toHaveBeenCalledWith('/trips/by-otp/12%2034');
    expect(transforms.transformTrip).toHaveBeenCalledWith(expect.objectContaining({ total_fare: 0, rate_per_km: 0, driver_payout: 0, driver_bata: 0 }));
  });

  it('getTripApplicants → GET /trips/:id/applicants', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'app1' }]) as never);
    const list = await getTripApplicants('t9');
    expect(get).toHaveBeenCalledWith('/trips/t9/applicants');
    expect(list[0]?.id).toBe('app1');
  });

  it('postTrip → POST /trips with the toApiPostTrip body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 't1' }) as never);
    await postTrip({ /* minimal — transform is stubbed */ } as never);
    expect(post).toHaveBeenCalledWith('/trips', { stub: true });
  });

  it('applyToTrip → POST /trips/:id/applicants with snake_case body, nulls when optional missing', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'app1' }) as never);
    await applyToTrip('t1', { vehicleId: 'v1' });
    expect(post).toHaveBeenCalledWith('/trips/t1/applicants', { vehicle_id: 'v1', applicant_quoted_rate_per_km: null, applicant_message: null });
    await applyToTrip('t1', { vehicleId: 'v1', quotedRatePerKm: 14, message: 'hi' });
    expect(post).toHaveBeenLastCalledWith('/trips/t1/applicants', { vehicle_id: 'v1', applicant_quoted_rate_per_km: 14, applicant_message: 'hi' });
  });

  it('withdrawApplication → DELETE /trips/:id/applicants/:acceptanceId, resolves void', async () => {
    const del = vi.spyOn(apiClient, 'delete').mockReturnValue(ok(null) as never);
    await expect(withdrawApplication('t1', 'a1')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith('/trips/t1/applicants/a1');
  });

  it('rejectApplicant → POST .../reject with decision_note (null if absent)', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'app1' }) as never);
    await rejectApplicant('t1', 'a1');
    expect(post).toHaveBeenCalledWith('/trips/t1/applicants/a1/reject', { decision_note: null });
    await rejectApplicant('t1', 'a1', 'late');
    expect(post).toHaveBeenLastCalledWith('/trips/t1/applicants/a1/reject', { decision_note: 'late' });
  });

  it('assignDriver → POST /trips/:id/assign { acceptance_id }', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 't1' }) as never);
    await assignDriver('t1', 'a1');
    expect(post).toHaveBeenCalledWith('/trips/t1/assign', { acceptance_id: 'a1' });
  });

  it('getStartOdoUploadUrl → POST /trips/:id/start-odo-upload-url + camelCase transform', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ bucket: 'trip-executions-photos', path: 't1/start_odo', signed_url: 'https://x', token: 'tok' }) as never);
    const r = await getStartOdoUploadUrl('t1');
    expect(post).toHaveBeenCalledWith('/trips/t1/start-odo-upload-url', {});
    expect(r.bucket).toBe('trip-executions-photos');
    expect(r.signedUrl).toBe('https://x');
    expect(r.path).toBe('t1/start_odo');
  });

  it('getEndOdoUploadUrl → POST /trips/:id/end-odo-upload-url', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ bucket: 'trip-executions-photos', path: 't1/end_odo', signed_url: 'https://y', token: 'tok' }) as never);
    const r = await getEndOdoUploadUrl('t1');
    expect(post).toHaveBeenCalledWith('/trips/t1/end-odo-upload-url', {});
    expect(r.path).toBe('t1/end_odo');
  });

  it('startTrip → POST /trips/:id/start with snake_case OTP + odo fields', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 't1' }) as never);
    await startTrip('t1', { passengerOtp: '1234', startOdoUrl: 'u', startOdoReading: 50000 });
    expect(post).toHaveBeenCalledWith('/trips/t1/start', { passenger_otp: '1234', start_odo_url: 'u', start_odo_reading: 50000 });
  });

  it('completeTrip → POST /trips/:id/complete with nulls + toll=0 when no input', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 't1' }) as never);
    await completeTrip('t1');
    expect(post).toHaveBeenCalledWith('/trips/t1/complete', {
      end_odo_url: null,
      end_odo_reading: null,
      toll_paid_by_driver: 0,
      driver_notes: null,
      driver_review_note: null,
    });
  });

  it('completeTrip → POST /trips/:id/complete forwards toll + review note', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 't1' }) as never);
    await completeTrip('t1', { endOdoUrl: 'u', endOdoReading: 50125, tollPaidByDriver: 75, driverNotes: 'all good', driverReviewNote: 'pays on time' });
    expect(post).toHaveBeenCalledWith('/trips/t1/complete', {
      end_odo_url: 'u',
      end_odo_reading: 50125,
      toll_paid_by_driver: 75,
      driver_notes: 'all good',
      driver_review_note: 'pays on time',
    });
  });

  it('cancelTrip → POST /trips/:id/cancel { cancel_reason_id }', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 't1' }) as never);
    await cancelTrip('t1', 'r1');
    expect(post).toHaveBeenCalledWith('/trips/t1/cancel', { cancel_reason_id: 'r1' });
  });

  it('updateTripPassenger → PATCH /trips/:id with only the fields that were supplied', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 't1' }) as never);
    await updateTripPassenger('t1', { passengerName: 'Sam', passengerCount: 3 });
    expect(patch).toHaveBeenCalledWith('/trips/t1', { passenger_name: 'Sam', passenger_count: 3 });
    await updateTripPassenger('t1', { hidePassengerPhone: true });
    expect(patch).toHaveBeenLastCalledWith('/trips/t1', { hide_passenger_phone: true });
  });

  it('updateTripDetails → PATCH /trips/:id maps every supported camelCase field to snake_case', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 't1' }) as never);
    await updateTripDetails('t1', {
      ratePerKm: 22,
      driverBata: 400,
      commissionPct: 12.5,
      gstAmount: 110,
      pickupAt: '2026-05-20T08:30:00.000Z',
      carTypeId: 'ct-suv',
      acRequired: false,
      seatsRequired: 6,
      driverInstructions: 'Call before arrival',
      extrasPaidByPassenger: false,
      showFareToPassenger: false,
    });
    expect(patch).toHaveBeenLastCalledWith('/trips/t1', {
      rate_per_km: 22,
      driver_bata: 400,
      commission_pct: 12.5,
      gst_amount: 110,
      pickup_at: '2026-05-20T08:30:00.000Z',
      car_type_id: 'ct-suv',
      ac_required: false,
      seats_required: 6,
      driver_instructions: 'Call before arrival',
      extras_paid_by_passenger: false,
      show_fare_to_passenger: false,
    });
  });

  it('updateTripDetails → omits keys that were not provided (sparse PATCH body)', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 't1' }) as never);
    await updateTripDetails('t1', { ratePerKm: 25 });
    expect(patch).toHaveBeenLastCalledWith('/trips/t1', { rate_per_km: 25 });
  });

  it('updateTripDetails → forwards null driverInstructions (clearing the field)', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 't1' }) as never);
    await updateTripDetails('t1', { driverInstructions: null });
    expect(patch).toHaveBeenLastCalledWith('/trips/t1', { driver_instructions: null });
  });
});
