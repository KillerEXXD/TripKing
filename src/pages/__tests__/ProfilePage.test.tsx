import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProfilePage } from '@/pages/ProfilePage';
import { ApiError } from '@/lib/api/client';
import type { Driver, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(), useMyAgent: vi.fn(), useUpdateDriver: vi.fn(), useUpdateAgent: vi.fn() }));
import { useMyAgent, useMyDriver, useUpdateAgent, useUpdateDriver } from '@/hooks/useDrivers';
vi.mock('@/hooks/useVehicles', () => ({ useDriverVehicles: vi.fn() }));
import { useDriverVehicles } from '@/hooks/useVehicles';
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() } }));
import { cityHooks } from '@/hooks/useAdminConfig';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const driverUser: User = { id: 'u1', role: 'driver', phone: '+919876500000', displayName: 'Ravi Kumar', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const adminUser: User = { ...driverUser, id: 'admin', role: 'admin', displayName: 'Admin' };
function makeDriver(over: Partial<Driver> = {}): Driver {
  return {
    id: 'd1',
    userId: 'u1',
    fullName: 'Ravi Kumar',
    displayHandle: 'A1B2C3D',
    phone: '+919876500000',
    homeCity: city('c1', 'Vellore'),
    currentCity: city('c1', 'Vellore'),
    profilePhotoUrl: '',
    kycStatus: 'approved',
    ratingAvg: 4.7,
    ratingCount: 9,
    ratingDistribution: { '1': 0, '2': 0, '3': 1, '4': 2, '5': 6 },
    topTags: [],
    managerTopTags: [],
    totalTripsCompleted: 20,
    vehicles: [],
    ...over,
  };
}

const logout = vi.fn().mockResolvedValue(undefined);
function setUser(user: User) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout });
}
type QState = { isPending?: boolean; isError?: boolean; error?: unknown; data?: unknown; refetch?: () => void };
function setMyDriver(s: QState = {}) {
  vi.mocked(useMyDriver).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
function setMyAgent(s: QState = {}) {
  vi.mocked(useMyAgent).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
function setUpdates() {
  const ud = { mutate: vi.fn(), isPending: false };
  const ua = { mutate: vi.fn(), isPending: false };
  vi.mocked(useUpdateDriver).mockReturnValue(ud as never);
  vi.mocked(useUpdateAgent).mockReturnValue(ua as never);
  return { ud, ua };
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/signin" element={<div>signin page</div>} />
        <Route path="/onboarding" element={<div>onboarding page</div>} />
        <Route path="/drivers/:id" element={<div>public driver profile</div>} />
        <Route path="/administration" element={<div>administration</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useMyAgent).mockReset();
    vi.mocked(useUpdateDriver).mockReset();
    vi.mocked(useUpdateAgent).mockReset();
    vi.mocked(useDriverVehicles).mockReset().mockReturnValue({ isPending: false, isError: false, data: [] } as never);
    vi.mocked(cityHooks.useList).mockReset().mockReturnValue({ data: [city('c1', 'Vellore')] } as never);
    logout.mockClear().mockResolvedValue(undefined);
    setUser(driverUser);
    setMyDriver({ data: makeDriver() });
    setMyAgent({});
    setUpdates();
  });

  it('shows the driver profile with rating, public-profile link and vehicles section', () => {
    setMyDriver({ data: makeDriver({ vehicles: [{ id: 'v1', makeLabel: 'Toyota', modelName: 'Innova', year: 2021, carTypeLabel: 'Innova', seats: 7, ac: true }] }) });
    vi.mocked(useDriverVehicles).mockReturnValue({ isPending: false, isError: false, data: [{ id: 'v1', makeLabel: 'Toyota', modelName: 'Innova', year: 2021, carTypeLabel: 'Innova', seats: 7, ac: true, isPrimary: true, driverId: 'd1', carTypeId: 'ct1' }] } as never);
    renderProfile();
    expect(screen.getByRole('heading', { name: 'Ravi Kumar' })).toBeInTheDocument();
    expect(screen.getByText(/9 reviews/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /your public profile/i })).toHaveAttribute('href', '/drivers/d1');
    expect(screen.getByText(/Toyota Innova 2021/)).toBeInTheDocument();
  });

  it('prompts to onboard when the user has no driver profile (404)', () => {
    setMyDriver({ isError: true, error: new ApiError('No profile for this user', 404) });
    renderProfile();
    expect(screen.getByText(/finish setting up your profile/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /set up my profile/i })).toHaveAttribute('href', '/onboarding');
  });

  it('shows an Administration link for an admin account', () => {
    setUser(adminUser);
    renderProfile();
    expect(screen.getByText(/admin account/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /administration/i })).toHaveAttribute('href', '/administration');
  });

  it('signing out logs out and goes to /signin', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(await screen.findByText('signin page')).toBeInTheDocument();
  });

  it('editing the driver profile saves via useUpdateDriver', () => {
    const { ud } = setUpdates();
    setMyDriver({ data: makeDriver() });
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ravi K' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(ud.mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1', input: expect.objectContaining({ fullName: 'Ravi K' }) }), expect.anything());
  });

  it('renders the agent profile for an agent account', () => {
    setUser({ ...driverUser, role: 'trip_manager' });
    setMyAgent({ data: { id: 'a1', userId: 'u1', fullName: 'Agent A', displayHandle: 'A1B2C3D', phone: '+91', businessName: 'A Travels', kycStatus: 'approved', topTags: [], totalTripsPosted: 12 } });
    renderProfile();
    expect(screen.getByRole('heading', { name: 'Agent A' })).toBeInTheDocument();
    expect(screen.getByText(/A Travels/)).toBeInTheDocument();
  });

  it('shows the 3-step verification checklist on an unverified agent profile', () => {
    setUser({ ...driverUser, role: 'trip_manager' });
    setMyAgent({ data: { id: 'a1', userId: 'u1', fullName: 'Agent A', displayHandle: 'A1B2C3D', phone: '+91', businessName: 'A Travels', kycStatus: 'docs_submitted', topTags: [], totalTripsPosted: 0, verification: { kycStatus: 'docs_submitted', steps: { details: 'done', documents: 'done', video_call: 'todo' }, stepsDone: 2, stepsTotal: 3 } } });
    renderProfile();
    expect(screen.getByText(/get verified to start earning/i)).toBeInTheDocument();
    expect(screen.getByText('Identity documents')).toBeInTheDocument();
    expect(screen.getByText('Video verification')).toBeInTheDocument();
    expect(screen.queryByText('Add your vehicle')).toBeNull();
  });
});
