import type { Trip, CityRow } from '@/types';

function city(id: string, name: string, state: string, lat: number, lng: number): CityRow {
  return { id, name, state, lat, lng, isActive: true, sortOrder: 0 };
}

function makeTrip(overrides: Partial<Trip> & Pick<Trip, 'id' | 'status'>): Trip {
  const base: Trip = {
    id: overrides.id,
    status: overrides.status,
    postedByUserId: 'agent-1',
    postedByRole: 'trip_manager',
    postedByHandle: 'A1B2C3D',
    fromCity: city('c1', 'Vellore', 'TN', 12.9, 79.1),
    toCity: city('c2', 'Chennai', 'TN', 13.08, 80.27),
    pickupAt: '2026-06-01T14:30:00Z',
    expectedDistanceKm: 138,
    carTypeId: 'sedan',
    carTypeLabel: 'Sedan',
    seatsRequired: 4,
    acRequired: true,
    ratePerKm: 14,
    totalFare: 4000,
    commissionPct: 10,
    gstAmount: 200,
    driverBata: 300,
    extrasPaidByPassenger: true,
    driverPayout: 4200,
    passengerName: '',
    passengerPhone: '',
    passengerCount: 2,
    acceptanceWindowMinutes: 15,
    showFareToPassenger: false,
    hidePassengerPhone: false,
    applicantCount: 0,
    pendingInvitationCount: 0,
    createdAt: '2026-05-30T10:00:00Z',
  } as Trip;
  return { ...base, ...overrides };
}

export const TRIP_FIXTURES: Trip[] = [
  makeTrip({ id: 't1', status: 'open', driverPayout: 4200 }),
  makeTrip({
    id: 't2',
    status: 'has_applicants',
    applicantCount: 3,
    driverPayout: 6500,
    fromCity: city('c3', 'Bangalore', 'KA', 12.97, 77.59),
    toCity: city('c4', 'Tirupati', 'AP', 13.62, 79.41),
  }),
  makeTrip({
    id: 't3',
    status: 'accepted',
    driverPayout: 3800,
    fromCity: city('c5', 'Salem', 'TN', 11.66, 78.14),
    toCity: city('c6', 'Coimbatore', 'TN', 11.01, 76.95),
  }),
  makeTrip({ id: 't4', status: 'in_progress', driverPayout: 5200 }),
];
