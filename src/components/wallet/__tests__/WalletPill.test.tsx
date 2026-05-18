import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/wallet');
import * as svc from '@/lib/api/services/wallet';
import { WalletPill } from '@/components/wallet/WalletPill';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('WalletPill', () => {
  it('renders nothing while wallet is loading', () => {
    vi.mocked(svc.getWallet).mockImplementation(() => new Promise(() => {}));
    const { container } = render(<Wrap><WalletPill /></Wrap>);
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows total balance and links to /wallet', async () => {
    vi.mocked(svc.getWallet).mockResolvedValue({
      walletId: 'w1',
      balance: { promoPaise: 0, transferredPaise: 0, cashPaise: 125000, totalPaise: 125000 },
      recentLedger: [],
    } as never);
    render(<Wrap><WalletPill /></Wrap>);
    await waitFor(() => expect(screen.getByText('₹1,250')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /open wallet/i })).toHaveAttribute('href', '/app/wallet');
  });

  it('flags low balance below threshold', async () => {
    vi.mocked(svc.getWallet).mockResolvedValue({
      walletId: 'w1',
      balance: { promoPaise: 0, transferredPaise: 0, cashPaise: 1000, totalPaise: 1000 },
      recentLedger: [],
    } as never);
    render(<Wrap><WalletPill lowBalanceThresholdPaise={5000} /></Wrap>);
    const link = await screen.findByRole('link', { name: /open wallet/i });
    expect(link.className).toMatch(/bg-amber-50/);
  });
});
