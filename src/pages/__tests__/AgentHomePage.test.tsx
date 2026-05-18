import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentHomePage } from '@/pages/AgentHomePage';
import { ApiError } from '@/lib/api/client';
import type { Agent, Trip, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useDrivers', () => ({ useMyAgent: vi.fn() }));
import { useMyAgent } from '@/hooks/useDrivers';
vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn() }));
import { useTrips } from '@/hooks/useTrips';
vi.mock('@/hooks/useVacancies', () => ({ useVacancies: vi.fn() }));
import { useVacancies } from '@/hooks/useVacancies';
vi.mock('@/hooks/useNotifications', () => ({ useUnreadNotificationCount: vi.fn(() => 0) }));
// The home page now embeds <HomeTileRow>, which fans out to useAnalytics +
// useReferral. Stub the whole component for these tests — its own coverage
// lives in src/components/home/__tests__/HomeTileRow.test.tsx.
vi.mock('@/components/home/HomeTileRow', () => ({ HomeTileRow: () => <div>home tile row</div> }));
vi.mock('@/components/layout/InstallAppCard', () => ({ InstallAppCard: () => <div>install card</div> }));
vi.mock('@/components/wallet/WalletPill', () => ({ WalletPill: () => <div>wallet pill</div> }));

const agentUser: User = { id: 'u1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const agent: Agent = { id: 'a1', userId: 'u1', fullName: 'Agent A', displayHandle: 'A1B2C3D', canReportBugs: false, phone: '+91', businessName: 'A Travels', businessCity: city('c1', 'Vellore'), profilePhotoUrl: '', kycStatus: 'approved', topTags: [], totalTripsPosted: 12 };
function makeTrip(over: Partial<Trip> = {}): Trip {
  return { id: 't1', postedByUserId: 'u1', postedByRole: 'trip_manager', postedByName: 'Agent A', postedByHandle: 'A1B2C3D', fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'), pickupAt: '2099-06-01T09:00:00Z', expectedDistanceKm: 140, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14, totalFare: 1960, commissionPct: 10, gstAmount: 98, driverBata: 300, extrasPaidByPassenger: true, driverPayout: 2200, passengerName: 'P', passengerPhone: '+91', passengerCount: 2, status: 'open', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0, pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00Z', acceptanceWindowMinutes: 15, ...over };
}

function setUser(user: User = agentUser) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
type QS = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; data?: unknown; refetch?: () => void };
function setMyAgent(s: QS = {}) {
  vi.mocked(useMyAgent).mockReturnValue({ isPending: false, isError: false, isSuccess: true, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
function setTrips(s: QS = {}) {
  vi.mocked(useTrips).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...s } as never);
}
function setVacancies(s: QS = {}) {
  vi.mocked(useVacancies).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...s } as never);
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AgentHomePage />} />
        <Route path="/app/onboarding" element={<div>onboarding page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgentHomePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useMyAgent).mockReset();
    vi.mocked(useTrips).mockReset();
    vi.mocked(useVacancies).mockReset();
    setUser();
    setMyAgent({ data: agent });
    setTrips({ data: [] });
    setVacancies({ data: [] });
  });

  it('prompts to onboard when the user has no agent profile (404)', () => {
    setMyAgent({ isError: true, isSuccess: false, error: new ApiError('No profile', 404) });
    renderHome();
    expect(screen.getByText(/finish setting up your agent profile/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /set up my profile/i }));
    expect(screen.getByText('onboarding page')).toBeInTheDocument();
  });

  it('renders the agent home — greeting, always-visible Post-a-trip CTA, reputation; hides empty Driving/Review placeholders', () => {
    setMyAgent({ data: agent });
    setTrips({ data: [] });
    renderHome();
    // Header uses getFirstName() ("Agent A" -> "Agent A") + a compact role
    // badge circle ("A" with title="Agent").
    expect(screen.getByText('Agent A', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Agent')).toBeInTheDocument();
    // Empty Driving-now and Review placeholders are no longer rendered.
    expect(screen.queryByText(/no trips in progress/i)).toBeNull();
    expect(screen.queryByText(/no applicants waiting/i)).toBeNull();
    // The agent CTA — equivalent to the driver's "I'm vacant" — is always visible.
    expect(screen.getByRole('link', { name: /post a trip/i })).toHaveAttribute('href', '/app/trips/new');
    expect(screen.getByText(/your reputation/i)).toBeInTheDocument();
    // The "Your analytics" PriorityCard was replaced by <HomeTileRow> (stubbed
    // here as "home tile row"); analytics still surface but inside the compact
    // 3-tile row instead of as a standalone card.
    expect(screen.getByText('home tile row')).toBeInTheDocument();
    // "Your recent trips" listing was removed (PR #192 on main) — agents now
    // jump to /posted-trips via the bottom-nav "My Posts" tab. Don't expect
    // the empty-state copy anymore.
    expect(screen.queryByText(/haven't posted a trip yet/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveAttribute('href', '/app/profile');
  });

  it('hides the Driving-now card when no trips are in progress', () => {
    setTrips({ data: [makeTrip({ status: 'open' })] });
    renderHome();
    expect(screen.queryByText(/driving now/i)).toBeNull();
  });

  it('hides the Review card when no trips have applicants', () => {
    setTrips({ data: [makeTrip({ status: 'open' })] });
    renderHome();
    expect(screen.queryByText(/waiting for your decision/i)).toBeNull();
  });

  it('surfaces the Review card when a posted trip has applicants (recent-trips section removed)', () => {
    setTrips({ data: [makeTrip({ id: 't1' }), makeTrip({ id: 't2', status: 'has_applicants', applicantCount: 1, fromCity: city('c3', 'Bangalore') })] });
    renderHome();
    // Recent-trips listing has been removed; only the Review priority card surfaces the trip route.
    expect(screen.getByText('Bangalore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/1 driver applied/i)).toBeInTheDocument();
  });

  it('Driving-now card: 1 trip → renders the rich single-trip card linking to detail', () => {
    setTrips({ data: [makeTrip({ id: 'only-1', status: 'in_progress', passengerCount: 2 })] });
    renderHome();
    const link = screen.getByRole('link', { name: /open trip vellore to chennai/i });
    expect(link).toHaveAttribute('href', '/app/trips/only-1');
    // Rich inline details are visible on the home card.
    expect(screen.getByText(/2 pax/i)).toBeInTheDocument();
    expect(screen.getByText(/140 km/i)).toBeInTheDocument();
  });

  it('Driving-now card: 2+ trips → links to /queue/in-progress', () => {
    setTrips({ data: [
      makeTrip({ id: 'a', status: 'in_progress' }),
      makeTrip({ id: 'b', status: 'in_progress' }),
    ] });
    renderHome();
    const link = screen.getByRole('link', { name: /2 trips in progress/i });
    expect(link).toHaveAttribute('href', '/app/queue/in-progress');
  });

  it('Review card: 1 trip needs a driver → rich card linking to the trip\'s applicants page', () => {
    setTrips({ data: [makeTrip({ id: 'pick-me', status: 'has_applicants', applicantCount: 3 })] });
    renderHome();
    const link = screen.getByRole('link', { name: /review applicants for vellore to chennai/i });
    expect(link).toHaveAttribute('href', '/app/trips/pick-me/applicants');
    expect(screen.getByText(/3 drivers applied/i)).toBeInTheDocument();
  });

  it('Review card: 2+ trips → links to /queue/needs-action', () => {
    setTrips({ data: [
      makeTrip({ id: 'a', status: 'has_applicants', applicantCount: 1 }),
      makeTrip({ id: 'b', status: 'has_applicants', applicantCount: 2 }),
    ] });
    renderHome();
    const link = screen.getByRole('link', { name: /2 trips need a driver/i });
    expect(link).toHaveAttribute('href', '/app/queue/needs-action');
  });

  it('shows the Get verified banner while the agent is not yet verified', () => {
    setMyAgent({ data: { ...agent, kycStatus: 'docs_submitted', verification: { kycStatus: 'docs_submitted', steps: { details: 'done', documents: 'done', video_call: 'todo' }, stepsDone: 2, stepsTotal: 3 } } });
    renderHome();
    expect(screen.getByText(/get verified to start earning/i)).toBeInTheDocument();
  });

  it('hides the Get verified banner once the agent is verified', () => {
    renderHome(); // default fixture: kycStatus 'approved', no verification block
    expect(screen.queryByText(/get verified to start earning/i)).toBeNull();
  });
});
