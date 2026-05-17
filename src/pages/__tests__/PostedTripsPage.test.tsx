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

function renderPosted(url = '/posted-trips') {
  return render(
    <MemoryRouter initialEntries={[url]}>
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
    expect(useTrips).toHaveBeenCalledWith({ postedByUserId: 'u1' }, { enabled: true });
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

  it('shows a NEW badge + "Posted just now" on trips created within the last 5 minutes', () => {
    const fresh = new Date(Date.now() - 5_000).toISOString(); // 5s ago → "just now"
    setTrips({ data: [makeTrip({ id: 't-fresh', createdAt: fresh })] });
    const { container } = renderPosted();
    expect(screen.getByText('NEW')).toBeInTheDocument();
    // The "Posted just now" line is split across text nodes (· Posted + relative time). Match on
    // the concatenated body text instead of one node.
    expect(container.textContent).toMatch(/Posted just now/i);
  });

  it('drops the NEW badge once the trip is older than 5 minutes but keeps showing the "Posted X ago" age line', () => {
    const old = new Date(Date.now() - 6 * 60_000).toISOString(); // 6 min ago
    setTrips({ data: [makeTrip({ id: 't-old', createdAt: old })] });
    renderPosted();
    expect(screen.queryByText('NEW')).toBeNull();
    // User asked for the age to show on every card, not just fresh ones — guard against
    // regressing back to "only fresh trips show their post time".
    expect(screen.getByText(/Posted 6m ago/i)).toBeInTheDocument();
  });

  // ── ?scope=invites-sent (drill-down view from the home "Invites sent" card) ────
  it('?scope=invites-sent — hides the filter chips, swaps the title, shows a back arrow, lists only trips with pending invites', () => {
    setTrips({ data: [
      makeTrip({ id: 'i1', status: 'open', pendingInvitationCount: 2, fromCity: city('c1', 'WithInvites') }),
      makeTrip({ id: 'i2', status: 'has_applicants', pendingInvitationCount: 1, fromCity: city('c2', 'AlsoWithInvites') }),
      makeTrip({ id: 'n1', status: 'open', pendingInvitationCount: 0, fromCity: city('c3', 'NoInvites') }),
      makeTrip({ id: 'd1', status: 'cancelled', pendingInvitationCount: 5, fromCity: city('c4', 'CancelledOutsideScope') }),
    ] });
    renderPosted('/posted-trips?scope=invites-sent&from=/');
    // Title swap + scope-specific subtitle (2 trips · 3 pending invites)
    expect(screen.getByText('Invites sent')).toBeInTheDocument();
    expect(screen.getByText(/2 trips · 3 pending invites/i)).toBeInTheDocument();
    // Back arrow renders + points to /
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/');
    // Filter chip strip is gone
    expect(screen.queryByRole('button', { name: /^all/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^invited/i })).toBeNull();
    // Only the two trips with pending invites + open/has_applicants show; cancelled (even with pending invites) is filtered out
    const headlines = screen.getAllByText(/→ Chennai/i).map((el) => el.textContent ?? '');
    expect(headlines.some((t) => t.includes('WithInvites'))).toBe(true);
    expect(headlines.some((t) => t.includes('AlsoWithInvites'))).toBe(true);
    expect(headlines.some((t) => t.includes('NoInvites'))).toBe(false);
    expect(headlines.some((t) => t.includes('CancelledOutsideScope'))).toBe(false);
  });

  it('?scope=invites-sent with no qualifying trips — renders the scoped empty state with a "Back to home" action', () => {
    setTrips({ data: [makeTrip({ id: 'p1', status: 'open', pendingInvitationCount: 0 })] });
    renderPosted('/posted-trips?scope=invites-sent&from=/');
    expect(screen.getByText('No invitations pending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  it('?scope=invites-sent — trip-card link includes ?from=/posted-trips?scope=invites-sent so the trip detail walks back to the scoped list', () => {
    setTrips({ data: [
      makeTrip({ id: 'i1', status: 'open', pendingInvitationCount: 2, fromCity: city('c1', 'Vellore') }),
    ] });
    renderPosted('/posted-trips?scope=invites-sent&from=/');
    const tripLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/trips/i1'));
    expect(tripLinks.length).toBeGreaterThan(0);
    for (const a of tripLinks) {
      expect(a.getAttribute('href')).toMatch(/^\/trips\/i1(\/[a-z]+)?\?from=/);
      const fromParam = new URL(a.getAttribute('href')!, 'https://x').searchParams.get('from');
      expect(fromParam).toContain('/posted-trips?scope=invites-sent');
    }
  });
});
