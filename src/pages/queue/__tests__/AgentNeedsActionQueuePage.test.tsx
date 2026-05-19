import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentNeedsActionQueuePage } from '@/pages/queue/AgentNeedsActionQueuePage';
import type { Trip, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn() }));
import { useTrips } from '@/hooks/useTrips';

const agentUser: User = { id: 'u1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return { id: 't1', postedByUserId: 'u1', postedByRole: 'trip_manager', postedByName: 'Agent A', postedByHandle: 'A1B2C3D', fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'), pickupAt: '2099-06-01T09:00:00Z', expectedDistanceKm: 140, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14, totalFare: 1960, commissionPct: 10, gstAmount: 98, driverBata: 300, extrasPaidByPassenger: true, driverPayout: 2200, passengerName: 'P', passengerPhone: '+91', passengerCount: 2, status: 'has_applicants', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 2, pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00Z', acceptanceWindowMinutes: 15, ...over };
}
type QS = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; data?: unknown; refetch?: () => void };
function setTrips(s: QS = {}) {
  vi.mocked(useTrips).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...s } as never);
}

function renderQ() {
  return render(
    <MemoryRouter initialEntries={['/app/queue/needs-action']}>
      <Routes>
        <Route path="/app/queue/needs-action" element={<AgentNeedsActionQueuePage />} />
        <Route path="/app" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgentNeedsActionQueuePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useTrips).mockReset();
    vi.mocked(useAuth).mockReturnValue({ user: agentUser, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() } as never);
  });

  it('queries trips with has_applicants for the poster', () => {
    setTrips({ data: [makeTrip({ id: 't1', applicantCount: 3 })] });
    renderQ();
    expect(useTrips).toHaveBeenCalledWith({ postedByUserId: 'u1', status: 'has_applicants' });
    expect(screen.getByText(/3 applicants/i)).toBeInTheDocument();
  });

  it('row links go to /trips/:id/applicants with ?from=/app/queue/needs-action', () => {
    setTrips({ data: [makeTrip({ id: 'abc' })] });
    renderQ();
    const link = screen.getByRole('link', { name: /Vellore → Chennai/i });
    expect(link).toHaveAttribute('href', '/app/trips/abc/applicants?from=/app/queue/needs-action');
  });

  it('back button goes to Home', () => {
    setTrips({ data: [makeTrip({ id: 't1' })] });
    renderQ();
    fireEvent.click(screen.getByRole('link', { name: /back/i }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});
