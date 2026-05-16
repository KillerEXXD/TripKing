import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
import * as svc from '@/lib/api/services/referrals';
import { EarningsStatsRow } from '@/components/referral/EarningsStatsRow';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const dash = {
  userId: 'u0',
  recentLedger: [],
  summary: {
    lifetimeEarnedPaise: 750000,
    reversedPaise: 0,
    transferredPaise: 0,
    withdrawnPaise: 25000,
    netPaise: 725000,
    withdrawablePaise: 60000,
    pendingPaise: 15000,
    counts: {
      totalReferred: 5, earningActive: 2, capReached: 0, signedUp: 0,
      verificationPending: 0, verified: 3, verificationRejected: 0,
      paidTripsStarted: 0, qualified: 2, suspended: 0, rejected: 0, expired: 0,
    },
  },
};

beforeEach(() => vi.clearAllMocks());

describe('EarningsStatsRow', () => {
  it('renders the 7 figures from the dashboard summary', async () => {
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue(dash as never);
    vi.mocked(svc.getMyReferralEarnings).mockResolvedValue({ from: '', to: '', days: [] } as never);
    render(<Wrap><EarningsStatsRow /></Wrap>);
    await waitFor(() => expect(screen.getByText('Lifetime')).toBeInTheDocument());
    expect(screen.getByText('₹7,500')).toBeInTheDocument();      // lifetime
    expect(screen.getByText('₹600')).toBeInTheDocument();        // withdrawable
    expect(screen.getByText('₹250')).toBeInTheDocument();        // withdrawn
    expect(screen.getByText('₹150')).toBeInTheDocument();        // pending
    expect(screen.getByText('3-day hold')).toBeInTheDocument();
  });

  it('sums today/week/month from the earnings series', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue(dash as never);
    vi.mocked(svc.getMyReferralEarnings).mockResolvedValue({
      from: '', to: '', days: [{ date: today, trips: 1, paise: 5000 }],
    } as never);
    render(<Wrap><EarningsStatsRow /></Wrap>);
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
    const todayCells = screen.getAllByText('₹50');
    expect(todayCells.length).toBeGreaterThan(0);
  });
});
