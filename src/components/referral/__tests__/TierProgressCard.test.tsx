import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
import * as svc from '@/lib/api/services/referrals';
import { TierProgressCard } from '@/components/referral/TierProgressCard';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const tiers = [
  { id: 't1', slotName: 'Tier 1', minQualifiedReferrals: 1, maxQualifiedReferrals: 10, capPaise: 250000, payoutPerTripPaise: 5000, appliesToRole: 'both', sortOrder: 1, isActive: true },
  { id: 't2', slotName: 'Tier 2', minQualifiedReferrals: 11, maxQualifiedReferrals: 25, capPaise: 350000, payoutPerTripPaise: 5000, appliesToRole: 'both', sortOrder: 2, isActive: true },
  { id: 't3', slotName: 'Tier 3', minQualifiedReferrals: 26, maxQualifiedReferrals: null, capPaise: null, payoutPerTripPaise: null, appliesToRole: 'both', sortOrder: 3, isActive: true },
];

const dashWithQualified = (qualified: number) => ({
  userId: 'u0', recentLedger: [],
  summary: {
    lifetimeEarnedPaise: 0, reversedPaise: 0, transferredPaise: 0, withdrawnPaise: 0,
    netPaise: 0, withdrawablePaise: 0, pendingPaise: 0,
    counts: {
      totalReferred: qualified, earningActive: 0, capReached: 0, signedUp: 0,
      verificationPending: 0, verified: 0, verificationRejected: 0,
      paidTripsStarted: 0, qualified, suspended: 0, rejected: 0, expired: 0,
    },
  },
});

beforeEach(() => vi.clearAllMocks());

describe('TierProgressCard', () => {
  it('renders current tier + next-tier delta for a Tier-1 referrer', async () => {
    vi.mocked(svc.getReferralTiers).mockResolvedValue(tiers as never);
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue(dashWithQualified(4) as never);
    render(<Wrap><TierProgressCard /></Wrap>);
    await waitFor(() => expect(screen.getByText(/₹2,500 cap/)).toBeInTheDocument());
    expect(screen.getAllByText(/Tier 1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/more to unlock Tier 2/)).toBeInTheDocument();
  });

  it('shows configurable cap for the top tier', async () => {
    vi.mocked(svc.getReferralTiers).mockResolvedValue(tiers as never);
    vi.mocked(svc.getMyReferralDashboard).mockResolvedValue(dashWithQualified(30) as never);
    render(<Wrap><TierProgressCard /></Wrap>);
    await waitFor(() => expect(screen.getByText(/Configurable cap/)).toBeInTheDocument());
    expect(screen.getAllByText(/Tier 3/).length).toBeGreaterThan(0);
  });
});
