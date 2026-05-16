import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { apiClient } from '@/lib/api/client';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

vi.mock('@/lib/api/services/auth', () => ({
  requestOtp: vi.fn().mockResolvedValue(undefined),
  verifyOtp: vi.fn(),
  getCurrentUser: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/sentry', () => ({ setSentryUser: vi.fn(), clearSentryUser: vi.fn(), captureDataError: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }));
import { queryClient } from '@/lib/queryClient';
vi.mock('@/lib/posthog', () => ({ identifyUser: vi.fn(), resetUser: vi.fn(), captureEvent: vi.fn() }));
import { getCurrentUser, verifyOtp, logout } from '@/lib/api/services/auth';
import { setSentryUser, clearSentryUser } from '@/lib/sentry';
import { identifyUser, resetUser } from '@/lib/posthog';

const driver: User = {
  id: 'u1',
  role: 'driver',
  phone: '+919999999999',
  displayName: 'Ravi',
  preferredLanguage: 'en',
  isActive: true, canReportBugs: false,
};

function Probe() {
  const { user, isAuthenticated, isLoading, verifyOtp: doVerify, logout: doLogout } = useAuth();
  return (
    <div>
      <span data-testid="state">{isLoading ? 'loading' : isAuthenticated ? `in:${user?.displayName}` : 'out'}</span>
      <button onClick={() => void doVerify('+91', '123456')}>verify</button>
      <button onClick={() => void doLogout()}>logout</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(verifyOtp).mockReset();
    vi.mocked(logout).mockReset().mockResolvedValue(undefined);
  });

  it('with no stored token, settles to "out" without calling /me', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue(null);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('with a stored token, restores the user from /me', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue('tok');
    vi.mocked(getCurrentUser).mockResolvedValue(driver);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Ravi'));
  });

  it('clears tokens when /me fails on restore', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue('bad');
    const clearSpy = vi.spyOn(apiClient, 'clearTokens');
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('401'));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));
    expect(clearSpy).toHaveBeenCalled();
  });

  it('verifyOtp sets the user; logout clears it', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue(null);
    vi.mocked(verifyOtp).mockResolvedValue(driver);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));

    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Ravi'));

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));
  });

  it('logout clears React Query cache + persisted per-user storage', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue(null);
    vi.mocked(verifyOtp).mockResolvedValue(driver);
    localStorage.setItem('tripking:my-applications', '{"state":{"byTrip":{"t1":{"x":1}}},"version":1}');
    localStorage.setItem('tripking:view-as', '{"state":{"view":"agent"},"version":1}');
    localStorage.setItem('unrelated-key', 'keep-me');
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));

    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Ravi'));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));

    expect(queryClient.clear).toHaveBeenCalled();
    expect(localStorage.getItem('tripking:my-applications')).toBeNull();
    expect(localStorage.getItem('tripking:view-as')).toBeNull();
    // never blow away keys we don't own:
    expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
  });

  it('verifyOtp with a DIFFERENT user clears cached previous state', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue('tok');
    vi.mocked(getCurrentUser).mockResolvedValue(driver);
    const otherUser: User = { ...driver, id: 'u2', displayName: 'Asha', phone: '+918888888888' };
    vi.mocked(verifyOtp).mockResolvedValue(otherUser);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Ravi'));
    vi.mocked(queryClient.clear).mockClear();

    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Asha'));
    expect(queryClient.clear).toHaveBeenCalled();
  });

  it('verifyOtp with the SAME user does NOT clear the cache (no spurious flush)', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue('tok');
    vi.mocked(getCurrentUser).mockResolvedValue(driver);
    vi.mocked(verifyOtp).mockResolvedValue(driver);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Ravi'));
    vi.mocked(queryClient.clear).mockClear();
    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Ravi'));
    expect(queryClient.clear).not.toHaveBeenCalled();
  });

  it('wires Sentry + PostHog user context on login and clears it on logout', async () => {
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue(null);
    vi.mocked(verifyOtp).mockResolvedValue(driver);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));

    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:Ravi'));
    expect(setSentryUser).toHaveBeenCalledWith({ id: 'u1', role: 'driver', name: 'Ravi' });
    expect(identifyUser).toHaveBeenCalledWith('u1', { role: 'driver' });

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));
    expect(clearSentryUser).toHaveBeenCalled();
    expect(resetUser).toHaveBeenCalled();
  });
});
