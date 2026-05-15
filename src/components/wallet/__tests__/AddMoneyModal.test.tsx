import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/wallet');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/wallet';
import { toast } from 'sonner';
import { AddMoneyModal } from '@/components/wallet/AddMoneyModal';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('AddMoneyModal', () => {
  it('initiate → verify on confirm and toasts the credited amount', async () => {
    vi.mocked(svc.initiateTopup).mockResolvedValue({ topupId: 't1', orderId: 'o', amountPaise: 50000, razorpayKeyId: '', stubbed: true } as never);
    vi.mocked(svc.verifyTopup).mockResolvedValue({ topupId: 't1', status: 'succeeded' } as never);
    const onClose = vi.fn();
    render(<Wrap><AddMoneyModal onClose={onClose} /></Wrap>);
    fireEvent.click(screen.getByRole('button', { name: /add ₹500/i }));
    await waitFor(() => expect(svc.verifyTopup).toHaveBeenCalledWith({ topupId: 't1' }));
    expect(svc.initiateTopup).toHaveBeenCalledWith({ amountPaise: 50000 });
    expect(toast.success).toHaveBeenCalledWith('Added ₹500 to your wallet');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the "Already credited" message on idempotent verify', async () => {
    vi.mocked(svc.initiateTopup).mockResolvedValue({ topupId: 't1', orderId: 'o', amountPaise: 50000, razorpayKeyId: '', stubbed: true } as never);
    vi.mocked(svc.verifyTopup).mockResolvedValue({ topupId: 't1', status: 'succeeded', alreadyCredited: true } as never);
    render(<Wrap><AddMoneyModal onClose={() => undefined} /></Wrap>);
    fireEvent.click(screen.getByRole('button', { name: /add ₹500/i }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Already credited'));
  });

  it('preset chips set the amount + the confirm button label', async () => {
    render(<Wrap><AddMoneyModal onClose={() => undefined} /></Wrap>);
    fireEvent.click(screen.getByRole('button', { name: '₹2,000' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /add ₹2,000/i })).toBeInTheDocument());
  });
});
