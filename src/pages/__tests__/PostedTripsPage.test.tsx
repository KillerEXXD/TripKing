import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PostedTripsPage } from '@/pages/PostedTripsPage';
import type { Trip, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn() }));
import { useTrips } from '@/hooks/useTrips';
vi.mock('@/components/share/ShareTripModal', () => ({ ShareTripModal: () => <div>share modal</div> }));

const user: User = { id: 'u1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u1',
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
    pendingInvitationCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  };
}

type TripsState = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; data?: Trip[]; refetch?: () => void };
function setTrips(state: TripsState) {
  vi.mocked(useTrips).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...state } as never);
}

function renderPosted() {
  return render(
    <MemoryRouter>
      <PostedTripsPage />
    </MemoryRouter>,
  );
}

describe('PostedTripsPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset().mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    vi.mocked(useTrips).mockReset();
  });

  it('passes the caller id to useTrips', () => {
    setTrips({ data: [] });
    renderPosted();
    expect(useTrips).toHaveBeenCalledWith({ postedByUserId: 'u1' });
  });

  it('renders a skeleton while loading', () => {
    setTrips({ isPending: true, isSuccess: false });
    renderPosted();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on failure', () => {
    const refetch = vi.fn();
    setTrips({ isError: true, isSuccess: false, refetch });
    renderPosted();
    expect(screen.getByText(/couldn't load your trips/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty state with a "Post a trip" action when there are no posted trips', () => {
    setTrips({ data: [] });
    renderPosted();
    expect(screen.getByText(/haven't posted any trips yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /post a trip/i }).length).toBeGreaterThan(0);
  });

  it('lists the caller\'s trips and filters by status', () => {
    setTrips({ data: [makeTrip({ id: 't1', status: 'open', fromCity: city('c1', 'Vellore') }), makeTrip({ id: 't2', status: 'completed', fromCity: city('c3', 'Bangalore') })] });
    renderPosted();
    // Default filter is "Open" — switch to "All" to see both statuses
    fireEvent.click(screen.getByRole('button', { name: /^all/i }));
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
    expect(screen.getByText(/bangalore → chennai/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^completed/i }));
    expect(screen.getByText(/bangalore → chennai/i)).toBeInTheDocument();
    expect(screen.queryByText(/vellore → chennai/i)).toBeNull();
  });

  it('shows a per-status empty state when the active filter matches nothing', () => {
    setTrips({ data: [makeTrip({ status: 'open' })] });
    renderPosted();
    fireEvent.click(screen.getByRole('button', { name: /^cancelled/i }));
    expect(screen.getByText(/no cancelled trips/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show all/i }));
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
  });

  it('opens the share sheet from a card and links a has-applicants trip to its applicants', () => {
    setTrips({ data: [makeTrip({ status: 'has_applicants', applicantCount: 2 })] });
    renderPosted();
    // Default filter is "Open"; the has_applicants trip lives under "Has applicants"
    fireEvent.click(screen.getByRole('button', { name: /^has applicants/i }));
    expect(screen.getByRole('link', { name: /review applicants/i })).toHaveAttribute('href', '/trips/t1/applicants');
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(screen.getByText('share modal')).toBeInTheDocument();
  });

  it('shows an "invited" badge + "View invites" link on cards with pending invitations', () => {
    setTrips({ data: [makeTrip({ status: 'open', pendingInvitationCount: 3 })] });
    renderPosted();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    expect(screen.getByText(/3 invited/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view invites/i })).toHaveAttribute('href', '/trips/t1/invitations');
  });

  it('hides the invited badge when there are no pending invitations', () => {
    setTrips({ data: [makeTrip({ status: 'open', pendingInvitationCount: 0 })] });
    renderPosted();
    expect(screen.queryByText(/ invited/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /view invites/i })).toBeNull();
  });

  it('Invited chip surfaces open trips with pending invitations (and hides them from Open)', () => {
    setTrips({ data: [
      makeTrip({ id: 't1', status: 'open', pendingInvitationCount: 0, fromCity: city('c1', 'Vellore') }),
      makeTrip({ id: 't2', status: 'open', pendingInvitationCount: 2, fromCity: city('c3', 'Bangalore') }),
    ] });
    renderPosted();
    // Default filter is "Open" — only the no-invitations trip
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
    expect(screen.queryByText(/bangalore → chennai/i)).toBeNull();
    // Invited chip — only the trip with pending invitations
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    expect(screen.getByText(/bangalore → chennai/i)).toBeInTheDocument();
    expect(screen.queryByText(/vellore → chennai/i)).toBeNull();
  });

  it('All sorts trips by lifecycle priority (open → invited → has_applicants → … → cancelled)', () => {
    setTrips({ data: [
      makeTrip({ id: 't1', status: 'cancelled', fromCity: city('c1', 'Cancelled-from') }),
      makeTrip({ id: 't2', status: 'open', pendingInvitationCount: 1, fromCity: city('c2', 'Invited-from') }),
      makeTrip({ id: 't3', status: 'open', fromCity: city('c3', 'Open-from') }),
    ] });
    renderPosted();
    fireEvent.click(screen.getByRole('button', { name: /^all/i }));
    const cards = screen.getAllByText(/-from → chennai/i);
    expect(cards[0]).toHaveTextContent(/^open-from/i);
    expect(cards[1]).toHaveTextContent(/^invited-from/i);
    expect(cards[2]).toHaveTextContent(/^cancelled-from/i);
  });
});
