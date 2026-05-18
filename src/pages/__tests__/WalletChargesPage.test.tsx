import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/wallet');
import * as svc from '@/lib/api/services/wallet';
import { WalletChargesPage } from '@/pages/WalletChargesPage';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('WalletChargesPage', () => {
  it('shows empty state when no fee_debit entries', async () => {
    vi.mocked(svc.getWalletLedger).mockResolvedValue([
      { id: 'l1', entryType: 'topup', subBalance: 'cash', amountPaise: 50000, createdAt: '2026-01-01T00:00:00Z' },
    ] as never);
    render(<Wrap><WalletChargesPage /></Wrap>);
    await waitFor(() => expect(screen.getByText(/No charges yet/i)).toBeInTheDocument());
  });

  it('renders fee_debit rows with amount and trip link', async () => {
    vi.mocked(svc.getWalletLedger).mockResolvedValue([
      { id: 'l1', entryType: 'fee_debit', subBalance: 'cash', amountPaise: -5000, paymentSource: 'cash_wallet', referenceType: 'trip', referenceId: 'trip-123', note: 'Driver-side platform fee', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'l2', entryType: 'topup', subBalance: 'cash', amountPaise: 50000, createdAt: '2026-01-01T00:00:00Z' },
    ] as never);
    render(<Wrap><WalletChargesPage /></Wrap>);
    await waitFor(() => expect(screen.getByText('Driver-side platform fee')).toBeInTheDocument());
    expect(screen.getByText('−₹50')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'trip' })).toHaveAttribute('href', '/app/trips/trip-123');
  });
});
