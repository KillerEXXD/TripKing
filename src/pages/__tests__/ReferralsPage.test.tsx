import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
vi.mock('@/lib/api/services/drivers');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'driver', displayName: 'Asha' }, isAuthenticated: true, isLoading: false }),
}));
import * as svc from '@/lib/api/services/referrals';
import * as driverSvc from '@/lib/api/services/drivers';
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
    vi.mocked(svc.getMyReferralEarnings).mockResolvedValue({ from: '', to: '', days: [] } as never);
    vi.mocked(svc.getMyReferred).mockResolvedValue([]);
    vi.mocked(svc.getMyWithdrawals).mockResolvedValue([]);
    vi.mocked(svc.getReferralTiers).mockResolvedValue([]);
    vi.mocked(driverSvc.getMyDriver).mockResolvedValue({} as never);
    render(<Wrap><ReferralsPage /></Wrap>);
    await waitFor(() => expect(screen.getByLabelText(/Transfer to trip wallet/i)).toBeInTheDocument());
    expect(screen.getAllByText('₹2,500').length).toBeGreaterThan(0);
  });
});
