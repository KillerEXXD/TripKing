import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
import * as svc from '@/lib/api/services/referrals';
import { ReferralsPage } from '@/pages/ReferralsPage';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ReferralsPage', () => {
  it('renders the lifetime stats + transfer panel', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue({
      userId: 'u1',
      summary: {
        lifetimeEarnedPaise: 250000,
        reversedPaise: 0,
        transferredPaise: 0,
        withdrawnPaise: 0,
        netPaise: 250000,
        withdrawablePaise: 250000,
        pendingPaise: 0,
        counts: { totalReferred: 5, qualified: 3, earningActive: 2, capReached: 1, signedUp: 0, verificationPending: 0, verified: 0, verificationRejected: 0, paidTripsStarted: 0, suspended: 0, rejected: 0, expired: 0 },
      },
      recentLedger: [],
    });
    render(<Wrap><ReferralsPage /></Wrap>);
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument()); // total referred
    expect(screen.getAllByText('₹2,500').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Transfer to trip wallet/i)).toBeInTheDocument();
  });
});
