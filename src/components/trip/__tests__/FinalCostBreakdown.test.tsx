import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinalCostBreakdown } from '@/components/trip/FinalCostBreakdown';
import type { Trip } from '@/types';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12, lng: 80, sortOrder: 0, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1', postedByUserId: 'u9', postedByRole: 'trip_manager', postedByName: 'A', postedByHandle: 'A1B2',
    fromCity: city('c1', 'V'), toCity: city('c2', 'C'), pickupAt: '2099-06-01T09:00:00.000Z',
    expectedDistanceKm: 100, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14,
    totalFare: 1400, commissionPct: 10, gstAmount: 50, driverBata: 200, extrasPaidByPassenger: true,
    driverPayout: 1410, passengerName: 'P', passengerPhone: '+91', passengerCount: 2,
    status: 'completed', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0,
    pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00.000Z', acceptanceWindowMinutes: 15,
    finalTotalFare: 1825, extraDistanceKm: 25, extraKmFare: 350, tollAmount: 75, finalDriverPayout: 1800,
    ...over,
  } as Trip;
}

describe('FinalCostBreakdown', () => {
  it('returns null for non-completed trips', () => {
    const { container } = render(<FinalCostBreakdown trip={makeTrip({ status: 'in_progress' })} audience="driver" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the full breakdown with extra-KM, toll, and "Your payout" label for the driver', () => {
    render(<FinalCostBreakdown trip={makeTrip()} audience="driver" />);
    expect(screen.getByText(/Base fare/)).toBeInTheDocument();
    expect(screen.getByText(/Extra 25 km/)).toBeInTheDocument();
    expect(screen.getByText(/Toll \(paid by driver/)).toBeInTheDocument();
    expect(screen.getByText(/Passenger bill total/)).toBeInTheDocument();
    expect(screen.getByText(/Platform commission/)).toBeInTheDocument();
    expect(screen.getByText(/Driver bata/)).toBeInTheDocument();
    expect(screen.getByText(/Toll reimbursement/)).toBeInTheDocument();
    expect(screen.getByText('Your payout')).toBeInTheDocument();
    expect(screen.getByText('₹1,800')).toBeInTheDocument();
  });

  it('uses "Driver\'s payout" wording for the agent audience', () => {
    render(<FinalCostBreakdown trip={makeTrip()} audience="agent" />);
    expect(screen.getByText("Driver's payout")).toBeInTheDocument();
  });

  it('admin sees an Δ row when the final payout differs from the baseline', () => {
    render(<FinalCostBreakdown trip={makeTrip()} audience="admin" />);
    expect(screen.getByText(/Original baseline payout/)).toBeInTheDocument();
    expect(screen.getByText(/Δ ₹390/)).toBeInTheDocument(); // 1800 - 1410
  });

  it('falls back gracefully when migration-059 fields are missing', () => {
    render(<FinalCostBreakdown trip={makeTrip({ finalTotalFare: undefined, extraDistanceKm: undefined, extraKmFare: undefined, tollAmount: undefined, finalDriverPayout: undefined })} audience="driver" />);
    expect(screen.queryByText(/Extra/)).toBeNull();
    expect(screen.queryByText(/Toll/)).toBeNull();
    // Falls back to baseline driverPayout.
    expect(screen.getByText('₹1,410')).toBeInTheDocument();
  });
});
