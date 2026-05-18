import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompletedTripCard } from '@/components/trip/CompletedTripCard';
import type { Trip } from '@/types';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12, lng: 80, sortOrder: 0, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1', postedByUserId: 'u9', postedByRole: 'trip_manager', postedByName: 'A', postedByHandle: 'A1B2',
    fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'), pickupAt: '2099-06-01T09:00:00.000Z',
    expectedDistanceKm: 100, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14,
    totalFare: 1400, commissionPct: 10, gstAmount: 50, driverBata: 200, extrasPaidByPassenger: true,
    driverPayout: 1410, passengerName: 'P', passengerPhone: '+91', passengerCount: 2,
    status: 'completed', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0,
    pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00.000Z', acceptanceWindowMinutes: 15,
    ...over,
  } as Trip;
}

const renderIt = (trip: Trip) =>
  render(
    <MemoryRouter>
      <CompletedTripCard trip={trip} linkFromPath="/my-trips?tab=completed" />
    </MemoryRouter>,
  );

describe('CompletedTripCard', () => {
  it('renders route, Completed badge, and the baseline payout when no final-* fields exist yet', () => {
    renderIt(makeTrip());
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/Paid/i)).toBeInTheDocument();
    // Falls back to driverPayout (1410) when finalDriverPayout is missing.
    expect(screen.getByText('₹1,410')).toBeInTheDocument();
  });

  it('prefers final_total_fare + final_driver_payout when the server has populated them', () => {
    renderIt(makeTrip({ finalTotalFare: 1825, finalDriverPayout: 1800, extraDistanceKm: 25, tollAmount: 75 }));
    expect(screen.getByText('₹1,800')).toBeInTheDocument();
    expect(screen.getByText(/incl\. ₹75/)).toBeInTheDocument();
    // The trip-summary line shows the extra-KM badge inline.
    expect(screen.getByText(/\+25 km extra/i)).toBeInTheDocument();
  });

  it('links to /trips/:id with the from-path breadcrumb preserved', () => {
    renderIt(makeTrip());
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/trips/t1?from=%2Fmy-trips%3Ftab%3Dcompleted');
  });
});
