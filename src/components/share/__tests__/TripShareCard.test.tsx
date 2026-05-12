import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TripShareCard } from '@/components/share/TripShareCard';
import type { Trip } from '@/types';

const city = (id: string, name: string, state = 'Tamil Nadu') => ({ id, name, state, lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u1',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
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

describe('TripShareCard', () => {
  it('shows the route, the required car type in the top stats, and the server-computed driver payout', () => {
    render(<TripShareCard trip={makeTrip()} />);
    expect(screen.getByText(/vellore/i)).toBeInTheDocument(); // route hero
    expect(screen.getByText('🚗 Car type required')).toBeInTheDocument(); // the top-stats tile label
    expect(screen.getByText('₹2,090')).toBeInTheDocument(); // driverPayout, not recomputed
    expect(screen.getByText('Trip ID: t1')).toBeInTheDocument();
  });

  it('falls back to "Any" when the car type label is missing and shows the poster phone', () => {
    render(<TripShareCard trip={makeTrip({ carTypeLabel: undefined })} />);
    expect(screen.getByText('🚗 Car type required')).toBeInTheDocument();
    expect(screen.getByText('Any')).toBeInTheDocument();
    expect(screen.getByText(/919876500000/)).toBeInTheDocument();
  });
});
