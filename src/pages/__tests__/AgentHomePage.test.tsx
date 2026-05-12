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
vi.mock('@/components/layout/InstallAppCard', () => ({ InstallAppCard: () => <div>install card</div> }));

const agentUser: User = { id: 'u1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const agent: Agent = { id: 'a1', userId: 'u1', fullName: 'Agent A', phone: '+91', businessName: 'A Travels', businessCity: city('c1', 'Vellore'), profilePhotoUrl: '', kycStatus: 'approved', topTags: [], totalTripsPosted: 12 };
function makeTrip(over: Partial<Trip> = {}): Trip {
  return { id: 't1', postedByUserId: 'u1', postedByRole: 'trip_manager', postedByName: 'Agent A', fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'), pickupAt: '2099-06-01T09:00:00Z', expectedDistanceKm: 140, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14, totalFare: 1960, commissionPct: 10, gstAmount: 98, driverBata: 300, extrasPaidByPassenger: true, driverPayout: 2200, passengerName: 'P', passengerPhone: '+91', passengerCount: 2, status: 'open', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0, createdAt: '2099-05-30T00:00:00Z', ...over };
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
        <Route path="/onboarding" element={<div>onboarding page</div>} />
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

  it('renders the agent home — greeting, action tiles, reputation', () => {
    setMyAgent({ data: agent });
    setTrips({ data: [] });
    renderHome();
    expect(screen.getByText('Agent A')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post a trip/i })).toHaveAttribute('href', '/trips/new');
    expect(screen.getByRole('link', { name: /find a driver/i })).toHaveAttribute('href', '/vacancies');
    expect(screen.getByText(/your reputation/i)).toBeInTheDocument();
    expect(screen.getByText(/haven't posted a trip yet/i)).toBeInTheDocument();
  });

  it('lists the agent\'s recent posts and an applicants prompt', () => {
    setTrips({ data: [makeTrip({ id: 't1' }), makeTrip({ id: 't2', status: 'has_applicants', fromCity: city('c3', 'Bangalore') })] });
    renderHome();
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText('Bangalore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/of your trips has applicants/i)).toBeInTheDocument();
  });
});
