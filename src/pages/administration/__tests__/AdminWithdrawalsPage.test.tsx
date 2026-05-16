import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/referrals';
import { AdminWithdrawalsPage } from '@/pages/administration/AdminWithdrawalsPage';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AdminWithdrawalsPage', () => {
  it('lists withdrawals matching the active filter', async () => {
    vi.mocked(svc.getAdminWithdrawals).mockResolvedValue([
      { id: 'w1', amountPaise: 250000, upiId: 'foo@upi', status: 'requested', requestedAt: '2026-01-01T00:00:00Z', user: { displayName: 'Asha', phone: '+91', role: 'driver' } } as never,
    ]);
    render(<Wrap><AdminWithdrawalsPage /></Wrap>);
    await waitFor(() => expect(screen.getByText('Asha')).toBeInTheDocument());
    expect(svc.getAdminWithdrawals).toHaveBeenCalledWith({ status: 'requested' });
    expect(screen.getByText('foo@upi')).toBeInTheDocument();
    expect(screen.getByText('₹2,500')).toBeInTheDocument();
  });

  it('Approve button calls patchAdminWithdrawal with outcome=approved', async () => {
    vi.mocked(svc.getAdminWithdrawals).mockResolvedValue([
      { id: 'w1', amountPaise: 100000, upiId: 'me@upi', status: 'requested', requestedAt: '2026-01-01T00:00:00Z', user: { displayName: 'Bo' } } as never,
    ]);
    vi.mocked(svc.patchAdminWithdrawal).mockResolvedValue({ id: 'w1', amountPaise: 100000, upiId: 'me@upi', status: 'approved', requestedAt: '2026-01-01T00:00:00Z' });
    render(<Wrap><AdminWithdrawalsPage /></Wrap>);
    await waitFor(() => screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(svc.patchAdminWithdrawal).toHaveBeenCalledWith('w1', { outcome: 'approved' }));
  });

  it('changing the filter refetches with the new status', async () => {
    vi.mocked(svc.getAdminWithdrawals).mockResolvedValue([]);
    render(<Wrap><AdminWithdrawalsPage /></Wrap>);
    await waitFor(() => expect(svc.getAdminWithdrawals).toHaveBeenCalledWith({ status: 'requested' }));
    fireEvent.click(screen.getByRole('button', { name: 'paid' }));
    await waitFor(() => expect(svc.getAdminWithdrawals).toHaveBeenCalledWith({ status: 'paid' }));
  });
});
