import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TripInvitationsPage } from '@/pages/TripInvitationsPage';
import type { Trip, TripInvitation, User } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useTrip: vi.fn(), useTripInvites: vi.fn(), useWithdrawTripInvite: vi.fn() }));
import { useTrip, useTripInvites, useWithdrawTripInvite } from '@/hooks/useTrips';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'agent1',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByHandle: 'A1B2C3D',
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
    pendingInvitationCount: 2,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  };
}

function makeInvite(over: Partial<TripInvitation> = {}): TripInvitation {
  return {
    id: 'inv1',
    tripId: 't1',
    driverId: 'd1',
    status: 'pending',
    createdAt: '2099-05-31T08:00:00.000Z',
    updatedAt: '2099-05-31T08:00:00.000Z',
    driver: {
      id: 'd1',
      userId: 'u1',
      displayHandle: 'A3E5A6E',
      ratingAvg: 4.6,
      ratingCount: 8,
      totalTripsCompleted: 22,
      topTags: ['Punctual'],
      kycStatus: 'approved',
    },
    ...over,
  };
}

const agent: User = { id: 'agent1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const stranger: User = { id: 'someone', role: 'driver', phone: '+91', displayName: 'Other', preferredLanguage: 'en', isActive: true, canReportBugs: false };

function setAuth(user: User) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
function setTrip(state: { isPending?: boolean; isError?: boolean; error?: unknown; data?: Trip; refetch?: () => void }) {
  vi.mocked(useTrip).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...state } as never);
}
function setInvites(state: { isPending?: boolean; isError?: boolean; data?: TripInvitation[]; refetch?: () => void }) {
  vi.mocked(useTripInvites).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...state } as never);
}
function setWithdraw() {
  const mut = { mutate: vi.fn(), isPending: false };
  vi.mocked(useWithdrawTripInvite).mockReturnValue(mut as never);
  return mut;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trips/t1/invitations']}>
      <Routes>
        <Route path="/trips/:id/invitations" element={<TripInvitationsPage />} />
        <Route path="/drivers/:id" element={<div>driver profile</div>} />
        <Route path="/posted-trips" element={<div>posted trips list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TripInvitationsPage', () => {
  beforeEach(() => {
    vi.mocked(useTrip).mockReset();
    vi.mocked(useTripInvites).mockReset();
    vi.mocked(useWithdrawTripInvite).mockReset();
    vi.mocked(useAuth).mockReset();
    setWithdraw();
  });

  it('renders an anonymous invite row (handle, rating, trips, KYC) — no name when status=pending', () => {
    setAuth(agent);
    setTrip({ data: makeTrip() });
    setInvites({ data: [makeInvite({ status: 'pending' })] });
    renderPage();
    expect(screen.getByText(/driver a3e5a6e/i)).toBeInTheDocument();
    expect(screen.getByText(/4.6/)).toBeInTheDocument();
    expect(screen.getByText(/22 trips/)).toBeInTheDocument();
    expect(screen.getByText(/awaiting driver/i)).toBeInTheDocument();
    expect(screen.queryByText(/ravi kumar/i)).toBeNull();
  });

  it('reveals the name on rows where the driver applied back (reciprocity)', () => {
    setAuth(agent);
    setTrip({ data: makeTrip() });
    setInvites({ data: [makeInvite({ status: 'applied', driver: { ...makeInvite().driver!, fullName: 'Ravi Kumar' } })] });
    renderPage();
    expect(screen.getByText(/ravi kumar/i)).toBeInTheDocument();
    expect(screen.getByText(/applied back/i)).toBeInTheDocument();
  });

  it('shows the empty state when no invitations have been sent', () => {
    setAuth(agent);
    setTrip({ data: makeTrip({ pendingInvitationCount: 0 }) });
    setInvites({ data: [] });
    renderPage();
    expect(screen.getByText(/no invitations sent for this trip yet/i)).toBeInTheDocument();
  });

  it('hides withdrawn rows from the list (migration 041 sibling-withdraw)', () => {
    setAuth(agent);
    setTrip({ data: makeTrip() });
    setInvites({ data: [
      makeInvite({ id: 'inv-pending', status: 'pending' }),
      makeInvite({ id: 'inv-withdrawn', status: 'withdrawn' }),
    ] });
    renderPage();
    expect(screen.getByText(/awaiting driver/i)).toBeInTheDocument();
    expect(screen.queryByText(/withdrawn/i)).toBeNull();
  });

  it('shows the assignment-aware empty state once the trip is past has_applicants', () => {
    setAuth(agent);
    setTrip({ data: makeTrip({ status: 'selected', pendingInvitationCount: 0 }) });
    setInvites({ data: [makeInvite({ status: 'withdrawn' }), makeInvite({ id: 'inv2', status: 'withdrawn' })] });
    renderPage();
    expect(screen.getByText(/no active invitations/i)).toBeInTheDocument();
    expect(screen.getByText(/withdrawn when you assigned a driver/i)).toBeInTheDocument();
    expect(screen.queryByText(/no invitations sent for this trip yet/i)).toBeNull();
  });

  it('refuses to show invitations to non-posters', () => {
    setAuth(stranger);
    setTrip({ data: makeTrip() });
    setInvites({ data: [] });
    renderPage();
    expect(screen.getByText(/only the trip poster can see/i)).toBeInTheDocument();
    expect(useTripInvites).toHaveBeenCalledWith('t1', false);
  });

  it('fires the withdraw mutation when the poster clicks Withdraw on a pending invite', () => {
    setAuth(agent);
    setTrip({ data: makeTrip() });
    setInvites({ data: [makeInvite({ id: 'inv-pending', status: 'pending' })] });
    const mut = setWithdraw();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /withdraw invite/i }));
    expect(mut.mutate).toHaveBeenCalledWith(
      { tripId: 't1', inviteId: 'inv-pending' },
      expect.any(Object),
    );
  });
});
