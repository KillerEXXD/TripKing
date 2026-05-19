import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { SignInPage } from '@/pages/SignInPage';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({
  apiClient: { getAccessToken: vi.fn(() => null), clearTokens: vi.fn() },
}));
import { apiClient } from '@/lib/api/client';

const requestOtp = vi.fn().mockResolvedValue(undefined);
const verifyOtp = vi.fn();

function mockAuth(isAuthenticated = false) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isAuthenticated,
    isLoading: false,
    requestOtp,
    verifyOtp,
    logout: vi.fn(),
  });
}

function renderSignIn(initialEntry: string | { pathname: string; state: unknown } = '/app/signin') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/app/signin" element={<SignInPage />} />
        <Route path="/app" element={<div>home page</div>} />
        <Route path="/app/onboarding" element={<div>onboarding screen</div>} />
        <Route path="/app/trips/abc" element={<div>deep-linked trip</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SignInPage', () => {
  beforeEach(() => {
    requestOtp.mockClear().mockResolvedValue(undefined);
    verifyOtp.mockReset();
  });

  it('shows the TripKing brand, the phone form, and the demo-OTP hint', () => {
    mockAuth();
    renderSignIn();
    expect(screen.getByRole('heading', { name: 'TripKing' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
    expect(screen.getByLabelText('Country code')).toBeInTheDocument();
    expect(screen.getByText(/code is always/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send otp/i })).toBeDisabled();
  });

  it('phone → OTP → verify calls the auth functions with the E.164 number, then goes to /onboarding', async () => {
    mockAuth();
    verifyOtp.mockResolvedValue({ id: 'u1', role: 'driver', phone: '+919876543210', displayName: '', preferredLanguage: 'en', isActive: true, canReportBugs: false });
    renderSignIn();

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '98765 43210' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await waitFor(() => expect(requestOtp).toHaveBeenCalledWith('+919876543210'));

    // now on the OTP stage
    const otpInput = await screen.findByLabelText('OTP code');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith('+919876543210', '123456'));
    // a plain sign-in lands on onboarding
    expect(await screen.findByText('onboarding screen')).toBeInTheDocument();
  });

  it('an admin signing in lands on /, not /onboarding (so RoleSwitcher + bottom nav render)', async () => {
    mockAuth();
    verifyOtp.mockResolvedValue({ id: 'u1', role: 'admin', phone: '+919840780100', displayName: '', preferredLanguage: 'en', isActive: true, canReportBugs: false });
    renderSignIn();

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '98407 80100' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    const otpInput = await screen.findByLabelText('OTP code');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('honours a pending "from" redirect after verify instead of /onboarding', async () => {
    mockAuth();
    verifyOtp.mockResolvedValue({ id: 'u1', role: 'driver', phone: '+919876543210', displayName: '', preferredLanguage: 'en', isActive: true, canReportBugs: false });
    renderSignIn({ pathname: '/app/signin', state: { from: '/app/trips/abc' } });

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    const otpInput = await screen.findByLabelText('OTP code');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));
    expect(await screen.findByText('deep-linked trip')).toBeInTheDocument();
  });

  it('still advances to OTP entry even if request-otp fails (no real SMS provider yet)', async () => {
    mockAuth();
    requestOtp.mockRejectedValueOnce(new Error('no SMS provider'));
    renderSignIn();
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9000000000' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    expect(await screen.findByLabelText('OTP code')).toBeInTheDocument();
  });

  it('"Use a different number" returns to the phone stage', async () => {
    mockAuth();
    renderSignIn();
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await screen.findByLabelText('OTP code');
    fireEvent.click(screen.getByRole('button', { name: /use a different number/i }));
    expect(await screen.findByLabelText('Mobile number')).toBeInTheDocument();
  });

  it('redirects away when already authenticated', () => {
    mockAuth(true);
    renderSignIn();
    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send otp/i })).toBeNull();
  });

  it('a11y: phone stage has no axe violations', async () => {
    mockAuth();
    const { container } = renderSignIn();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a11y: OTP stage has no axe violations', async () => {
    mockAuth();
    const { container } = renderSignIn();
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await screen.findByLabelText('OTP code');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('clears stale tokens on mount when landing unauthenticated with a leftover access token (incident 2026-05-16)', () => {
    mockAuth(false);
    vi.mocked(apiClient.getAccessToken).mockReturnValue('eyJ...stale');
    vi.mocked(apiClient.clearTokens).mockClear();
    renderSignIn();
    expect(apiClient.clearTokens).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear tokens on a clean signed-out visit (no leftover token to clean)', () => {
    mockAuth(false);
    vi.mocked(apiClient.getAccessToken).mockReturnValue(null);
    vi.mocked(apiClient.clearTokens).mockClear();
    renderSignIn();
    expect(apiClient.clearTokens).not.toHaveBeenCalled();
  });

  it('does NOT clear tokens while auth is still bootstrapping (isLoading=true)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      requestOtp,
      verifyOtp,
      logout: vi.fn(),
    });
    vi.mocked(apiClient.getAccessToken).mockReturnValue('eyJ...still-validating');
    vi.mocked(apiClient.clearTokens).mockClear();
    renderSignIn();
    expect(apiClient.clearTokens).not.toHaveBeenCalled();
  });
});
