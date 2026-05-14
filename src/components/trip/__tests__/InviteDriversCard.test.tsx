import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InviteDriversCard } from '@/components/trip/InviteDriversCard';
import type { Driver, Trip, TripInvitation } from '@/types';

vi.mock('@/hooks/useTrips', () => ({
  useTripInvites: vi.fn(),
  useInviteDrivers: vi.fn(),
  useWithdrawTripInvite: vi.fn(),
}));
vi.mock('@/hooks/useDrivers', () => ({ useDrivers: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useTripInvites, useInviteDrivers, useWithdrawTripInvite } from '@/hooks/useTrips';
import { useDrivers } from '@/hooks/useDrivers';

const city = { id: 'c1', name: 'Vellore', state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true };
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u9',
    postedByRole: 'trip_manager',
    postedByHandle: 'A1',
    fromCity: city,
    toCity: { ...city, id: 'c2', name: 'Chennai' },
    pickupAt: '2099-06-01T09:00:00.000Z',
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
    driverPayout: 2200,
    passengerName: 'P',
    passengerPhone: '+91',
    passengerCount: 2,
    status: 'open',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  } as Trip;
}
function makeInvite(over: Partial<TripInvitation> = {}): TripInvitation {
  return {
    id: 'iv1',
    tripId: 't1',
    driverId: 'd1',
    status: 'pending',
    createdAt: '2099-05-30T00:00:00.000Z',
    updatedAt: '2099-05-30T00:00:00.000Z',
    driver: { id: 'd1', userId: 'u1', displayHandle: 'D1', fullName: 'Ravi', ratingAvg: 5, ratingCount: 10, totalTripsCompleted: 20, topTags: [] },
    ...over,
  };
}
function makeDriver(over: Partial<Driver> = {}): Driver {
  return { id: 'd2', userId: 'u2', displayHandle: 'D2', fullName: 'Ayan', ratingAvg: 4.5, ratingCount: 5, totalTripsCompleted: 8, ...over } as Driver;
}

describe('InviteDriversCard', () => {
  beforeEach(() => {
    vi.mocked(useTripInvites).mockReset();
    vi.mocked(useInviteDrivers).mockReset();
    vi.mocked(useWithdrawTripInvite).mockReset();
    vi.mocked(useDrivers).mockReset();
    vi.mocked(useInviteDrivers).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(useWithdrawTripInvite).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(useDrivers).mockReturnValue({ isPending: false, data: [] } as never);
  });

  it('shows existing invitations with their status badge', () => {
    vi.mocked(useTripInvites).mockReturnValue({ isPending: false, data: [makeInvite({ status: 'applied' })] } as never);
    render(<InviteDriversCard trip={makeTrip()} />);
    expect(screen.getByText(/applied/i)).toBeInTheDocument();
  });

  it('renders an empty hint when there are no invites yet', () => {
    vi.mocked(useTripInvites).mockReturnValue({ isPending: false, data: [] } as never);
    render(<InviteDriversCard trip={makeTrip()} />);
    expect(screen.getByText(/no invites yet/i)).toBeInTheDocument();
  });

  it('lets the poster pick drivers from the picker dialog and send invites', () => {
    vi.mocked(useTripInvites).mockReturnValue({ isPending: false, data: [] } as never);
    vi.mocked(useDrivers).mockReturnValue({ isPending: false, data: [makeDriver()] } as never);
    const mutate = vi.fn();
    vi.mocked(useInviteDrivers).mockReturnValue({ mutate, isPending: false } as never);
    render(<InviteDriversCard trip={makeTrip()} />);
    fireEvent.click(screen.getByRole('button', { name: /invite/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /invite ayan/i }));
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(mutate).toHaveBeenCalledWith({ tripId: 't1', driverIds: ['d2'] }, expect.anything());
  });
});
