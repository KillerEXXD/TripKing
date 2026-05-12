import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from '@/AppRoutes';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
// These pages' data hooks are exercised in their own tests — here we only check routing.
vi.mock('@/pages/OnboardingPage', () => ({ default: () => <div>onboarding screen</div> }));
vi.mock('@/pages/TripFeedPage', () => ({ default: () => <div>trip feed</div> }));
vi.mock('@/pages/PostTripPage', () => ({ default: () => <div>post trip</div> }));
vi.mock('@/pages/TripDetailPage', () => ({ default: () => <div>trip detail</div> }));

const admin: User = { id: 'a', role: 'admin', phone: '+91', displayName: 'Admin', preferredLanguage: 'en', isActive: true };
const driver: User = { ...admin, id: 'd', role: 'driver', displayName: 'Driver' };

function setAuth(user: User | null, isLoading = false) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    isAuthenticated: user !== null,
    isLoading,
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    logout: vi.fn(),
  });
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppRoutes', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('/signin renders the sign-in page', async () => {
    setAuth(null);
    renderAt('/signin');
    expect(await screen.findByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('/ redirects an anonymous user to /signin', async () => {
    setAuth(null);
    renderAt('/');
    expect(await screen.findByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('/ renders the home page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/');
    expect(await screen.findByRole('link', { name: /post a trip/i })).toBeInTheDocument();
  });

  it('/onboarding renders the onboarding screen for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/onboarding');
    expect(await screen.findByText(/onboarding screen/i)).toBeInTheDocument();
  });

  it('/onboarding redirects an anonymous user to /signin', async () => {
    setAuth(null);
    renderAt('/onboarding');
    expect(await screen.findByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('/trips renders the trip feed for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/trips');
    expect(await screen.findByText(/trip feed/i)).toBeInTheDocument();
  });

  it('/trips/new renders the post-trip page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/trips/new');
    expect(await screen.findByText(/post trip/i)).toBeInTheDocument();
  });

  it('/trips/:id renders the trip detail for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/trips/abc123');
    expect(await screen.findByText(/trip detail/i)).toBeInTheDocument();
  });

  it('/administration renders the admin hub for an admin', async () => {
    setAuth(admin);
    renderAt('/administration');
    expect(await screen.findByRole('heading', { name: /administration/i })).toBeInTheDocument();
  });

  it('/administration 403s a signed-in non-admin', async () => {
    setAuth(driver);
    renderAt('/administration');
    expect(await screen.findByText(/admins only/i)).toBeInTheDocument();
  });

  it('an unknown path renders the 404 page', async () => {
    setAuth(driver);
    renderAt('/no/such/page');
    expect(await screen.findByText(/404/i)).toBeInTheDocument();
  });
});
