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
    acceptanceWindowMinutes: 15,
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

  it('renders the route chain when the trip has 3+ waypoints (multi-stop)', () => {
    const wp = (id: string, c: string, state = 'TN') => ({ id, seq: 0, city: city(c, c, state), waitMinutes: 0, isDestination: true });
    const trip = makeTrip({
      tripType: 'multi_way',
      waypoints: [
        { ...wp('w1', 'Chennai'), seq: 0 },
        { ...wp('w2', 'Vellore'), seq: 1 },
        { ...wp('w3', 'Trichy'), seq: 2 },
        { ...wp('w4', 'Pondicherry'), seq: 3 },
      ],
    });
    render(<TripShareCard trip={trip} />);
    // each city name appears in the chain (the big A→B headline is replaced)
    expect(screen.getByText(/Chennai/)).toBeInTheDocument();
    expect(screen.getByText(/Vellore/)).toBeInTheDocument();
    expect(screen.getByText(/Trichy/)).toBeInTheDocument();
    expect(screen.getByText(/Pondicherry/)).toBeInTheDocument();
    // variant label is in the header
    expect(screen.getByText(/Multi-way drop/)).toBeInTheDocument();
  });

  it('shows a multi-day span line when expected_end_at is more than 1 day after pickup', () => {
    const trip = makeTrip({
      pickupAt: '2099-06-01T03:30:00.000Z',
      expectedEndAt: '2099-06-03T05:00:00.000Z', // ~2 days later
    });
    render(<TripShareCard trip={trip} />);
    expect(screen.getByText(/3-day trip/)).toBeInTheDocument(); // ceil(span/1d) = 3
    expect(screen.getByText(/ends/)).toBeInTheDocument();
  });
});
