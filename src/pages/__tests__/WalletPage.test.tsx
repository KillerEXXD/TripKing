import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/wallet');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/wallet';
import { WalletPage } from '@/pages/WalletPage';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('WalletPage', () => {
  it('renders the three sub-balances and total', async () => {
    vi.mocked(svc.getWallet).mockResolvedValue({
      walletId: 'w1',
      balance: { promoPaise: 100000, cashPaise: 25000, transferredPaise: 0, totalPaise: 125000 },
      recentLedger: [],
    } as never);
    render(<Wrap><WalletPage /></Wrap>);
    await waitFor(() => expect(screen.getByText('₹1,250')).toBeInTheDocument()); // total
    expect(screen.getByText('Launch credit')).toBeInTheDocument();
    expect(screen.getByText('Real money')).toBeInTheDocument();
    expect(screen.getByText('From referrals')).toBeInTheDocument();
  });

  it('renders empty-state copy when ledger is empty', async () => {
    vi.mocked(svc.getWallet).mockResolvedValue({
      walletId: 'w1',
      balance: { promoPaise: 0, cashPaise: 0, transferredPaise: 0, totalPaise: 0 },
      recentLedger: [],
    } as never);
    render(<Wrap><WalletPage /></Wrap>);
    await waitFor(() => expect(screen.getByText('No activity yet.')).toBeInTheDocument());
  });

  it('lists ledger entries with sub-balance label', async () => {
    vi.mocked(svc.getWallet).mockResolvedValue({
      walletId: 'w1',
      balance: { promoPaise: 100000, cashPaise: 0, transferredPaise: 0, totalPaise: 100000 },
      recentLedger: [{ id: 'l1', entryType: 'promo_credit_grant', subBalance: 'promo', amountPaise: 100000, note: 'Welcome credit', createdAt: '2026-01-01T00:00:00Z' }],
    } as never);
    render(<Wrap><WalletPage /></Wrap>);
    await waitFor(() => expect(screen.getByText('Welcome credit')).toBeInTheDocument());
  });

  it('clicking Add money opens the modal', async () => {
    vi.mocked(svc.getWallet).mockResolvedValue({
      walletId: 'w1',
      balance: { promoPaise: 0, cashPaise: 0, transferredPaise: 0, totalPaise: 0 },
      recentLedger: [],
    } as never);
    render(<Wrap><WalletPage /></Wrap>);
    await waitFor(() => screen.getByRole('button', { name: /add money/i }));
    fireEvent.click(screen.getByRole('button', { name: /add money/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });
});
