import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
// recharts uses ResponsiveContainer which needs a width — stub it.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 600, height: 220 }}>{children}</div> };
});
import * as svc from '@/lib/api/services/referrals';
import { EarningsTimelineChart } from '@/components/referral/EarningsTimelineChart';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('EarningsTimelineChart', () => {
  it('shows the empty message when no days', async () => {
    vi.mocked(svc.getMyReferralEarnings).mockResolvedValue({ from: '2026-01-01', to: '2026-01-31', days: [] });
    render(<Wrap><EarningsTimelineChart /></Wrap>);
    await waitFor(() => expect(screen.getByText(/No accruals in this range yet/i)).toBeInTheDocument());
  });

  it('renders the chart container when there are days', async () => {
    vi.mocked(svc.getMyReferralEarnings).mockResolvedValue({ from: '2026-01-01', to: '2026-01-31', days: [{ date: '2026-01-05', trips: 2, paise: 10000 }] });
    render(<Wrap><EarningsTimelineChart /></Wrap>);
    await waitFor(() => expect(screen.getByRole('img', { name: /Daily referral earnings/i })).toBeInTheDocument());
  });

  it('changing the range refetches with new from/to', async () => {
    vi.mocked(svc.getMyReferralEarnings).mockResolvedValue({ from: '2026-01-01', to: '2026-01-31', days: [] });
    render(<Wrap><EarningsTimelineChart /></Wrap>);
    await waitFor(() => expect(svc.getMyReferralEarnings).toHaveBeenCalled());
    const callsBefore = vi.mocked(svc.getMyReferralEarnings).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Last 7 days/i }));
    await waitFor(() => expect(vi.mocked(svc.getMyReferralEarnings).mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
