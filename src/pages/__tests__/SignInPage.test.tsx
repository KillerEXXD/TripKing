import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SignInPage } from '@/pages/SignInPage';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

function renderSignIn() {
  return render(
    <MemoryRouter initialEntries={['/signin']}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/" element={<div>home page</div>} />
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
    expect(screen.getByText(/the code is always/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send otp/i })).toBeDisabled();
  });

  it('phone → OTP → verify calls the auth functions with the E.164 number', async () => {
    mockAuth();
    verifyOtp.mockResolvedValue({ id: 'u1', role: 'driver', phone: '+919876543210', displayName: '', preferredLanguage: 'en', isActive: true });
    renderSignIn();

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '98765 43210' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await waitFor(() => expect(requestOtp).toHaveBeenCalledWith('+919876543210'));

    // now on the OTP stage
    const otpInput = await screen.findByLabelText('OTP code');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith('+919876543210', '123456'));
    // after verify it navigates to "/"
    expect(await screen.findByText('home page')).toBeInTheDocument();
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
});
