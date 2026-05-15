import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InvitesReceivedCard } from '@/components/home/InvitesReceivedCard';
import type { Trip } from '@/types';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u1',
    postedByRole: 'trip_manager',
    postedByName: 'A',
    postedByHandle: 'A',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
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
    pendingInvitationCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  };
}

function renderCard(trips: Trip[]) {
  return render(
    <MemoryRouter>
      <InvitesReceivedCard trips={trips} />
    </MemoryRouter>,
  );
}

describe('InvitesReceivedCard', () => {
  it('renders nothing when there are no pending invitations', () => {
    const { container } = renderCard([]);
    expect(container.firstChild).toBeNull();
  });

  it('links to the trip detail with route + payout when there is exactly one invitation', () => {
    renderCard([makeTrip({ id: 'inv-1', driverPayout: 3000 })]);
    const link = screen.getByRole('link');
    // ?from=/ tells TripDetailPage's back button to return to driver Home, not /my-trips.
    expect(link).toHaveAttribute('href', '/trips/inv-1?from=/');
    expect(link).toHaveTextContent(/vellore → chennai/i);
    expect(link).toHaveTextContent(/accept or decline/i);
  });

  it('links to /my-trips?tab=invited when multiple invitations are pending', () => {
    renderCard([makeTrip({ id: 'a' }), makeTrip({ id: 'b' }), makeTrip({ id: 'c' })]);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/my-trips?tab=invited');
    expect(link).toHaveTextContent(/3 trips invited you to drive/i);
  });
});
