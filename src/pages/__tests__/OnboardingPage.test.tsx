import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OnboardingPage } from '@/pages/OnboardingPage';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';

vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() } }));
import { cityHooks } from '@/hooks/useAdminConfig';

vi.mock('@/hooks/useDrivers', () => ({
  useCreateMyDriverProfile: vi.fn(),
  useCreateMyAgentProfile: vi.fn(),
  useMyDriver: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
  useMyAgent: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
}));
import { useCreateMyAgentProfile, useCreateMyDriverProfile } from '@/hooks/useDrivers';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

const driver: User = { id: 'u1', role: 'driver', phone: '+919876543210', displayName: 'Driver D', preferredLanguage: 'en', isActive: true, canReportBugs: false };

function setUser(user: User | null) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: user !== null, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}

type CityList = { isPending?: boolean; isError?: boolean; data?: Array<{ id: string; name: string; state: string }>; refetch?: () => void };
function setCities(list: CityList) {
  vi.mocked(cityHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...list } as never);
}

function mkMutation(overrides: Partial<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean; isError: boolean }> = {}) {
  return { mutateAsync: vi.fn().mockResolvedValue({ id: 'd1' }), isPending: false, isError: false, ...overrides };
}
function setMutations(driverMut = mkMutation(), agentMut = mkMutation()) {
  vi.mocked(useCreateMyDriverProfile).mockReturnValue(driverMut as never);
  vi.mocked(useCreateMyAgentProfile).mockReturnValue(agentMut as never);
  return { driverMut, agentMut };
}

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/app/onboarding']}>
      <Routes>
        <Route path="/app/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Walk from the intro carousel to the driver profile form. */
function gotoDriverProfile() {
  fireEvent.click(screen.getByRole('button', { name: /^skip$/i })); // intro → role
  fireEvent.click(screen.getByRole('button', { name: /i'm a driver/i })); // role → profile
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(cityHooks.useList).mockReset();
    vi.mocked(useCreateMyDriverProfile).mockReset();
    vi.mocked(useCreateMyAgentProfile).mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    setUser(driver);
    setCities({ data: [{ id: 'c1', name: 'Vellore', state: 'TN' }] });
    setMutations();
  });

  it('shows the role-keyed intro carousel and advances through it', () => {
    renderOnboarding();
    expect(screen.getByText('Trips come to you')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Apply in one tap')).toBeInTheDocument();
  });

  it('"Skip" on the intro goes to the role step (not home)', () => {
    renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(screen.getByRole('heading', { name: /how will you use tripking/i })).toBeInTheDocument();
    expect(screen.queryByText('home page')).toBeNull();
  });

  it('renders a loading skeleton while the cities query is pending', () => {
    setCities({ isPending: true });
    renderOnboarding();
    gotoDriverProfile();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry when the cities query fails', () => {
    const refetch = vi.fn();
    setCities({ isError: true, refetch });
    renderOnboarding();
    gotoDriverProfile();
    expect(screen.getByText(/couldn't load cities/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders an empty state when there are no cities', () => {
    setCities({ data: [] });
    renderOnboarding();
    gotoDriverProfile();
    expect(screen.getByText(/no cities available/i)).toBeInTheDocument();
  });

  it('submitting the driver form calls createMyDriverProfile and navigates home', async () => {
    const { driverMut } = setMutations();
    renderOnboarding();
    gotoDriverProfile();
    // name is prefilled from the user's display name
    fireEvent.change(screen.getByLabelText('Home city'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: /create my profile/i }));
    await waitFor(() => expect(driverMut.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Driver D', homeCityId: 'c1' })));
    expect(toast.success).toHaveBeenCalled();
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('submitting the agent form calls createMyAgentProfile with business_city_id-shaped input', async () => {
    const { agentMut } = setMutations();
    renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    fireEvent.click(screen.getByRole('button', { name: /i'm an agent/i }));
    fireEvent.change(screen.getByLabelText('Business city'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Agent A' } });
    fireEvent.click(screen.getByRole('button', { name: /create my profile/i }));
    await waitFor(() => expect(agentMut.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Agent A', businessCityId: 'c1' })));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('shows an inline error and a toast when profile creation fails', async () => {
    const driverMut = mkMutation({ mutateAsync: vi.fn().mockRejectedValue(new Error('boom')), isError: true });
    setMutations(driverMut);
    renderOnboarding();
    gotoDriverProfile();
    fireEvent.change(screen.getByLabelText('Home city'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: /create my profile/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText(/couldn't create your profile/i)).toBeInTheDocument();
    expect(screen.queryByText('home page')).toBeNull();
  });

  it('"Skip for now" on the profile step goes home', () => {
    renderOnboarding();
    gotoDriverProfile();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});
