import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useReferral');
import * as rh from '@/hooks/useReferral';

import { OperatorReferralsPage } from '@/pages/v2/operator-console/ReferralsPage';
import { FieldReferralsPage } from '@/pages/v2/field-companion/ReferralsPage';
import { PipelineReferralsPage } from '@/pages/v2/pipeline-board/ReferralsPage';
import { EditorialReferralsPage } from '@/pages/v2/editorial/ReferralsPage';
import { BharatReferralsPage } from '@/pages/v2/bharat-native/ReferralsPage';

const DASHBOARD = {
  userId: 'u1',
  summary: {
    lifetimeEarnedPaise: 250000,
    reversedPaise: 0,
    transferredPaise: 0,
    withdrawnPaise: 0,
    netPaise: 250000,
    withdrawablePaise: 250000,
    pendingPaise: 0,
    counts: {
      totalReferred: 5, qualified: 3, earningActive: 2, capReached: 1,
      signedUp: 0, verificationPending: 0, verified: 2, verificationRejected: 0,
      paidTripsStarted: 0, suspended: 0, rejected: 0, expired: 0,
    },
  },
  recentLedger: [],
};

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function mockDashboard() {
  vi.mocked(rh.useReferralDashboard).mockReturnValue({
    data: DASHBOARD,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof rh.useReferralDashboard>);
}

beforeEach(() => vi.clearAllMocks());

describe('v2 referrals pages', () => {
  it('Operator: dense stats grid + code row', () => {
    mockDashboard();
    render(<Wrap><OperatorReferralsPage /></Wrap>);
    expect(screen.getAllByText('₹2,500').length).toBeGreaterThan(0); // lifetime + withdrawable both render
    expect(screen.getByText(/RAVEE-X91Z/)).toBeInTheDocument();
  });

  it('Field: huge lifetime hero + share CTA', () => {
    mockDashboard();
    render(<Wrap><FieldReferralsPage /></Wrap>);
    expect(screen.getByText(/lifetime earned/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share my code/i })).toBeInTheDocument();
  });

  it('Pipeline: 4 status columns', () => {
    mockDashboard();
    render(<Wrap><PipelineReferralsPage /></Wrap>);
    for (const c of ['Signed up', 'Verified', 'Earning', 'Cap reached']) {
      expect(screen.getByText(c)).toBeInTheDocument();
    }
  });

  it('Editorial: patron column serif numerals', () => {
    mockDashboard();
    render(<Wrap><EditorialReferralsPage /></Wrap>);
    expect(screen.getByText(/the patron's column/i)).toBeInTheDocument();
  });

  it('Bharat: bilingual hero + 3 share tiles', () => {
    mockDashboard();
    render(<Wrap><BharatReferralsPage /></Wrap>);
    expect(screen.getByText(/நண்பர்களை அழைக்க/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /வாட்ஸ்அப்/ })).toBeInTheDocument();
  });
});
