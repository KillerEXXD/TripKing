import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-stage5');
import * as svc from '@/lib/api/services/admin-stage5';
import { AdminAppWalletPage } from '@/pages/administration/AdminAppWalletPage';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AdminAppWalletPage', () => {
  it('renders balance + a row from the ledger', async () => {
    vi.mocked(svc.getAppWallet).mockResolvedValue({
      balance: { totalPaise: 50000, lifetimeCollectedPaise: 100000, lifetimeRefundedPaise: 30000, entries: 12 },
      ledger: [
        { id: 'l1', entryType: 'fee_credit', amountPaise: 5000, createdAt: '2026-01-01T00:00:00Z', fee: { tripId: 't1', side: 'driver', paymentSource: 'cash_wallet', status: 'charged' } },
      ],
    });
    render(<Wrap><AdminAppWalletPage /></Wrap>);
    await waitFor(() => expect(screen.getByRole('link', { name: 'trip' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'trip' })).toHaveAttribute('href', '/trips/t1');
    expect(screen.getByText('fee_credit')).toBeInTheDocument();
  });

  it('renders empty state when ledger is empty', async () => {
    vi.mocked(svc.getAppWallet).mockResolvedValue({
      balance: { totalPaise: 0, lifetimeCollectedPaise: 0, lifetimeRefundedPaise: 0, entries: 0 },
      ledger: [],
    });
    render(<Wrap><AdminAppWalletPage /></Wrap>);
    await waitFor(() => expect(screen.getByText(/No entries\./)).toBeInTheDocument());
  });
});
