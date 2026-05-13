import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookVideoCallPage } from '@/pages/BookVideoCallPage';
import type { Agent, Driver, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(), useMyAgent: vi.fn() }));
import { useMyAgent, useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/hooks/useVideoVerification', () => ({
  useAvailableVideoSlots: vi.fn(() => ({ isPending: false, isError: false, data: [{ slotAt: '2099-06-01T09:00:00Z', slotMinutes: 15 }], refetch: vi.fn() })),
  useBookVideoCall: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCancelVideoCall: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRescheduleVideoCall: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useVideoVerification: vi.fn(() => ({ data: undefined })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const city = { id: 'c1', name: 'Vellore', state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true };
const driver: Driver = { id: 'd1', userId: 'u1', fullName: 'Ravi', displayHandle: 'A1B2C3D', phone: '+91', homeCity: city, currentCity: city, profilePhotoUrl: '', kycStatus: 'docs_submitted', ratingAvg: 0, ratingCount: 0, ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, topTags: [], managerTopTags: [], totalTripsCompleted: 0, vehicles: [], verification: { kycStatus: 'docs_submitted', steps: { documents: 'done' }, stepsDone: 2, stepsTotal: 5 } };
const agent: Agent = { id: 'a1', userId: 'u2', fullName: 'Agent A', displayHandle: 'A1B2C3D', phone: '+91', businessName: 'A Travels', businessCity: city, profilePhotoUrl: '', kycStatus: 'docs_submitted', topTags: [], totalTripsPosted: 0, verification: { kycStatus: 'docs_submitted', steps: { documents: 'done' }, stepsDone: 2, stepsTotal: 3 } };

function q(data: unknown) {
  return { isPending: false, isError: false, data, refetch: vi.fn() } as never;
}
function setUser(u: User) {
  vi.mocked(useAuth).mockReturnValue({ user: u, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
function renderPage() {
  return render(<MemoryRouter initialEntries={['/verify/video-call']}><BookVideoCallPage /></MemoryRouter>);
}

describe('BookVideoCallPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useMyDriver).mockReset().mockReturnValue(q(undefined));
    vi.mocked(useMyAgent).mockReset().mockReturnValue(q(undefined));
  });

  it('reads the driver profile and shows the slot picker once docs are submitted', () => {
    setUser({ id: 'u1', role: 'driver', phone: '+91', displayName: 'Ravi', preferredLanguage: 'en', isActive: true });
    vi.mocked(useMyDriver).mockReturnValue(q(driver));
    renderPage();
    expect(vi.mocked(useMyDriver).mock.calls.some(([enabled]) => enabled === true)).toBe(true);
    expect(screen.getByText(/pick a slot for your video call/i)).toBeInTheDocument();
  });

  it('reads the agent profile for a trip manager', () => {
    setUser({ id: 'u2', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true });
    vi.mocked(useMyAgent).mockReturnValue(q(agent));
    renderPage();
    expect(vi.mocked(useMyAgent).mock.calls.some(([enabled]) => enabled === true)).toBe(true);
    expect(vi.mocked(useMyDriver).mock.calls.every(([enabled]) => enabled === false)).toBe(true);
    expect(screen.getByText(/pick a slot for your video call/i)).toBeInTheDocument();
  });
});
