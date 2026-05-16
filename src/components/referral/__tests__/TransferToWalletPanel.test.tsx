import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/referrals';
import { toast } from 'sonner';
import { TransferToWalletPanel } from '@/components/referral/TransferToWalletPanel';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('TransferToWalletPanel', () => {
  it('shows the spec §22 warning verbatim', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({ userId: 'u1', summary: { withdrawablePaise: 250000 } as never, recentLedger: [] });
    render(<Wrap><TransferToWalletPanel /></Wrap>);
    await waitFor(() => expect(screen.getByText(/cannot be withdrawn later and will not generate further referral rewards/i)).toBeInTheDocument());
  });

  it('renders the withdrawable balance', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({ userId: 'u1', summary: { withdrawablePaise: 250000 } as never, recentLedger: [] });
    render(<Wrap><TransferToWalletPanel /></Wrap>);
    await waitFor(() => expect(screen.getByText('₹2,500')).toBeInTheDocument());
  });

  it('preset chip + Transfer call POST with the right paise amount', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({ userId: 'u1', summary: { withdrawablePaise: 250000 } as never, recentLedger: [] });
    vi.mocked(svc.transferReferralToCashWallet).mockResolvedValue({ promoPaise: 0, transferredPaise: 50000, cashPaise: 0, totalPaise: 50000, netReferralPaise: 200000 });
    render(<Wrap><TransferToWalletPanel /></Wrap>);
    await waitFor(() => screen.getByRole('button', { name: '₹500' }));
    fireEvent.click(screen.getByRole('button', { name: '₹500' }));
    fireEvent.click(screen.getByRole('button', { name: /transfer ₹500/i }));
    await waitFor(() => expect(svc.transferReferralToCashWallet).toHaveBeenCalledWith(50000));
    expect(toast.success).toHaveBeenCalledWith('Transferred ₹500 to your trip wallet');
  });

  it('confirm button is disabled when amount > withdrawable or = 0', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({ userId: 'u1', summary: { withdrawablePaise: 0 } as never, recentLedger: [] });
    render(<Wrap><TransferToWalletPanel /></Wrap>);
    await waitFor(() => expect(screen.getByRole('button', { name: /transfer ₹0/i })).toBeDisabled());
  });
});
