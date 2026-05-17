import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentInProgressQueuePage } from '@/pages/queue/AgentInProgressQueuePage';
import type { Trip, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn() }));
import { useTrips } from '@/hooks/useTrips';

const agentUser: User = { id: 'u1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return { id: 't1', postedByUserId: 'u1', postedByRole: 'trip_manager', postedByName: 'Agent A', postedByHandle: 'A1B2C3D', fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'), pickupAt: '2099-06-01T09:00:00Z', expectedDistanceKm: 140, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14, totalFare: 1960, commissionPct: 10, gstAmount: 98, driverBata: 300, extrasPaidByPassenger: true, driverPayout: 2200, passengerName: 'P', passengerPhone: '+91', passengerCount: 2, status: 'in_progress', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0, pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00Z', acceptanceWindowMinutes: 15, ...over };
}
type QS = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; data?: unknown; refetch?: () => void };
function setTrips(s: QS = {}) {
  vi.mocked(useTrips).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...s } as never);
}

function renderQ() {
  return render(
    <MemoryRouter initialEntries={['/queue/in-progress']}>
      <Routes>
        <Route path="/queue/in-progress" element={<AgentInProgressQueuePage />} />
        <Route path="/" element={<div>home page</div>} />
        <Route path="/trips/:id" element={<div>trip detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgentInProgressQueuePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useTrips).mockReset();
    vi.mocked(useAuth).mockReturnValue({ user: agentUser, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() } as never);
  });

  it('renders trips with the agent-poster status filter', () => {
    setTrips({ data: [makeTrip({ id: 't1' }), makeTrip({ id: 't2', fromCity: city('c3', 'Bangalore') })] });
    renderQ();
    expect(useTrips).toHaveBeenCalledWith({ postedByUserId: 'u1', status: 'in_progress' });
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText('Bangalore → Chennai')).toBeInTheDocument();
  });

  it('back button goes to Home', () => {
    setTrips({ data: [makeTrip({ id: 't1' })] });
    renderQ();
    fireEvent.click(screen.getByRole('link', { name: /back/i }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('renders the empty state when the queue starts empty', () => {
    setTrips({ data: [] });
    renderQ();
    expect(screen.getByText(/no trips in progress/i)).toBeInTheDocument();
  });

  it('row links carry ?from=/queue/in-progress', () => {
    setTrips({ data: [makeTrip({ id: 'abc' })] });
    renderQ();
    const link = screen.getByRole('link', { name: /Vellore → Chennai/i });
    expect(link).toHaveAttribute('href', '/trips/abc?from=/queue/in-progress');
  });
});
