import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InvitesSentCard } from '@/components/home/InvitesSentCard';
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
      <InvitesSentCard trips={trips} />
    </MemoryRouter>,
  );
}

describe('InvitesSentCard', () => {
  it('renders nothing when no trip has pending invitations (consistent with the hide-empty pattern)', () => {
    const { container } = renderCard([makeTrip({ pendingInvitationCount: 0 })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('links to the single trip\'s invitations page (with ?from=/ so its back arrow returns home)', () => {
    renderCard([
      makeTrip({ id: 'ta', pendingInvitationCount: 0 }),
      makeTrip({ id: 'tb', pendingInvitationCount: 2 }),
    ]);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/app/trips/tb/invitations?from=/');
    expect(link).toHaveTextContent(/2 invites awaiting driver/i);
  });

  it('links to the scoped /posted-trips?scope=invites-sent view when 2+ trips have pending invites', () => {
    renderCard([
      makeTrip({ id: 't1', pendingInvitationCount: 1 }),
      makeTrip({ id: 't2', pendingInvitationCount: 3 }),
    ]);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/app/posted-trips?scope=invites-sent&from=/');
    expect(link).toHaveTextContent(/4 invites awaiting driver/i);
    expect(link).toHaveTextContent(/across 2 trips/i);
  });

  it('singularises the headline when exactly one invite is pending', () => {
    renderCard([makeTrip({ pendingInvitationCount: 1 })]);
    expect(screen.getByText(/^1 invite awaiting driver$/i)).toBeInTheDocument();
  });

  it('only counts trips whose status is open or has_applicants — stale invites on in_progress/selected/etc trips are ignored', () => {
    renderCard([
      makeTrip({ id: 't-open', status: 'open', pendingInvitationCount: 2 }),
      // Pending-invite rows can linger on these statuses but the agent already
      // decided, so they're not "awaiting" anyone. Card must agree with the scope
      // page's filter (`?scope=invites-sent` predicate on PostedTripsPage).
      makeTrip({ id: 't-in-progress', status: 'in_progress', pendingInvitationCount: 3 }),
      makeTrip({ id: 't-selected', status: 'selected', pendingInvitationCount: 1 }),
      makeTrip({ id: 't-completed', status: 'completed', pendingInvitationCount: 4 }),
    ]);
    const link = screen.getByRole('link');
    // Only the `open` trip counts → 2 invites across 1 trip → routes to its detail.
    expect(link).toHaveAttribute('href', '/app/trips/t-open/invitations?from=/');
    expect(link).toHaveTextContent(/2 invites awaiting driver/i);
  });
});
