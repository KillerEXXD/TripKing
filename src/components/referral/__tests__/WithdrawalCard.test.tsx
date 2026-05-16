import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/referrals';
import { toast } from 'sonner';
import { WithdrawalCard } from '@/components/referral/WithdrawalCard';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('WithdrawalCard', () => {
  it('renders withdrawable balance and disables Request until form is valid', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({ userId: 'u1', summary: { withdrawablePaise: 100000 } as never, recentLedger: [] });
    vi.mocked(svc.getMyWithdrawals).mockResolvedValue([]);
    render(<Wrap><WithdrawalCard /></Wrap>);
    await waitFor(() => expect(screen.getByRole('button', { name: /request/i })).toBeDisabled());
    expect(screen.getByText(/Withdrawable balance:/i)).toBeInTheDocument();
  });

  it('lists past withdrawals with status', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({ userId: 'u1', summary: { withdrawablePaise: 0 } as never, recentLedger: [] });
    vi.mocked(svc.getMyWithdrawals).mockResolvedValue([
      { id: 'w1', amountPaise: 50000, upiId: 'foo@upi', status: 'paid', requestedAt: '2026-01-01T00:00:00Z' } as never,
      { id: 'w2', amountPaise: 25000, upiId: 'bar@upi', status: 'rejected', rejectedReason: 'KYC pending', requestedAt: '2026-01-02T00:00:00Z' } as never,
    ]);
    render(<Wrap><WithdrawalCard /></Wrap>);
    await waitFor(() => expect(screen.getByText('Paid')).toBeInTheDocument());
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText(/KYC pending/)).toBeInTheDocument();
  });

  it('preset + valid UPI → request POST with paise + upi', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({ userId: 'u1', summary: { withdrawablePaise: 100000 } as never, recentLedger: [] });
    vi.mocked(svc.getMyWithdrawals).mockResolvedValue([]);
    vi.mocked(svc.requestReferralWithdrawal).mockResolvedValue({ withdrawalId: 'w1', amountPaise: 50000, status: 'requested', withdrawableRemainingPaise: 50000 });
    render(<Wrap><WithdrawalCard /></Wrap>);
    await waitFor(() => screen.getByRole('button', { name: '₹500' }));
    fireEvent.click(screen.getByRole('button', { name: '₹500' }));
    fireEvent.change(screen.getByPlaceholderText('you@upi'), { target: { value: 'me@axis' } });
    fireEvent.click(screen.getByRole('button', { name: /request ₹500/i }));
    await waitFor(() => expect(svc.requestReferralWithdrawal).toHaveBeenCalledWith(50000, 'me@axis'));
    expect(toast.success).toHaveBeenCalledWith('Withdrawal requested — ₹500 to me@axis');
  });
});
