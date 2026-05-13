import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildShareCaption, buildShareUrl, nativeShareTrip, shareFilename } from '@/lib/share/tripShare';
import type { Trip } from '@/types';

const city = (id: string, name: string, state = 'Tamil Nadu') => ({ id, name, state, lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u1',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByHandle: 'A1B2C3D',
    postedByPhone: '+919876500000',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
    pickupAt: '2099-06-01T03:30:00.000Z',
    expectedDistanceKm: 140,
    carTypeId: 'ct1',
    carTypeLabel: 'Innova',
    seatsRequired: 7,
    acRequired: true,
    ratePerKm: 15,
    totalFare: 2100,
    commissionPct: 10,
    gstAmount: 100,
    driverBata: 300,
    extrasPaidByPassenger: true,
    driverPayout: 2090,
    passengerName: 'Passenger P',
    passengerPhone: '+910000000000',
    passengerCount: 2,
    status: 'open',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('buildShareUrl', () => {
  it('builds a /trips/:id link off the current origin', () => {
    expect(buildShareUrl(makeTrip({ id: 'abc' }))).toMatch(/\/trips\/abc$/);
  });
});

describe('shareFilename', () => {
  it('slugs the route + id into a .png filename', () => {
    expect(shareFilename(makeTrip({ id: 'xyz', fromCity: city('c1', 'New Delhi'), toCity: city('c2', 'Agra') }))).toBe('tripking-new-delhi-to-agra-xyz.png');
  });
});

describe('buildShareCaption', () => {
  it('includes the car type required, the route, the bata, the server payout and the link', () => {
    const caption = buildShareCaption(makeTrip());
    expect(caption).toContain('🚗 Car type required: Innova · AC');
    expect(caption).toContain('Pickup: Vellore, Tamil Nadu');
    expect(caption).toContain('Drop: Chennai, Tamil Nadu');
    expect(caption).toContain('🤝 Bata: ₹300');
    expect(caption).toContain('≈ Driver payout: ₹2,090');
    expect(caption).toMatch(/🔗 View & apply: .*\/trips\/t1/);
  });
  it('with withUrl:false omits the inline link', () => {
    const caption = buildShareCaption(makeTrip(), { withUrl: false });
    expect(caption).not.toContain('/trips/t1');
    expect(caption).toContain('🔗 Link below');
  });
});

describe('nativeShareTrip', () => {
  const blob = new Blob(['x'], { type: 'image/png' });

  it('returns "unsupported" when navigator.share is unavailable', async () => {
    // jsdom has no navigator.share by default.
    await expect(nativeShareTrip(blob, 'f.png', 'cap')).resolves.toBe('unsupported');
  });

  it('returns "shared" when navigator.share resolves', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await expect(nativeShareTrip(blob, 'f.png', 'cap')).resolves.toBe('shared');
    expect(share).toHaveBeenCalled();
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it('returns "cancelled" when the user aborts the share sheet', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(abort), configurable: true });
    await expect(nativeShareTrip(blob, 'f.png', 'cap')).resolves.toBe('cancelled');
    delete (navigator as unknown as { share?: unknown }).share;
  });
});
