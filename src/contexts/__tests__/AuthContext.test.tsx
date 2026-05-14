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
