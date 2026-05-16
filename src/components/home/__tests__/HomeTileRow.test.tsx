import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeTileRow } from '@/components/home/HomeTileRow';

vi.mock('@/hooks/useReferral', () => ({ useReferral: vi.fn() }));
import { useReferral } from '@/hooks/useReferral';

vi.mock('@/hooks/useAnalytics', () => ({ useDriverAnalytics: vi.fn(), useAgentAnalytics: vi.fn() }));
import { useAgentAnalytics, useDriverAnalytics } from '@/hooks/useAnalytics';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

function withRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const driverAnalytics = { earningsTotal: 4200, tripsCompleted: 14 } as never;
const agentAnalytics = { driverPayoutCompletedTotal: 56000, tripsPosted: 22 } as never;
const referralView: { code: string; link: string; shareMessage: string; whatsappUrl: string } = { code: 'RAVI23', link: 'https://trip-king.vercel.app/?ref=RAVI23', shareMessage: '...', whatsappUrl: '...' };

beforeEach(() => {
  vi.mocked(useDriverAnalytics).mockReset();
  vi.mocked(useAgentAnalytics).mockReset();
  vi.mocked(useReferral).mockReset();
});

describe('HomeTileRow — driver', () => {
  it('shows earnings total + trips count, analytics trips, and the referral code', () => {
    vi.mocked(useDriverAnalytics).mockReturnValue({ data: driverAnalytics, isPending: false } as never);
    vi.mocked(useAgentAnalytics).mockReturnValue({ data: undefined, isPending: false } as never);
    vi.mocked(useReferral).mockReturnValue({ data: referralView as never, isPending: false } as never);

    withRouter(<HomeTileRow role="driver" />);

    // Earnings tile -> formatted ₹ total + the trip count subline.
    expect(screen.getByRole('link', { name: /earnings/i })).toHaveAttribute('href', '/my-earnings');
    expect(screen.getByText(/14 trips/)).toBeInTheDocument();

    // Analytics tile -> count headline.
    expect(screen.getByRole('link', { name: /analytics/i })).toHaveAttribute('href', '/analytics');
    expect(screen.getByText('14')).toBeInTheDocument();

    // Referral tile -> code visible inside its link.
    expect(screen.getByRole('link', { name: /refer and earn/i })).toHaveAttribute('href', '/referrals');
    expect(screen.getByText('RAVI23')).toBeInTheDocument();
  });

  it('renders graceful placeholders when analytics or referral data is missing', () => {
    vi.mocked(useDriverAnalytics).mockReturnValue({ data: undefined, isPending: true } as never);
    vi.mocked(useAgentAnalytics).mockReturnValue({ data: undefined, isPending: false } as never);
    vi.mocked(useReferral).mockReturnValue({ data: undefined, isPending: true } as never);

    withRouter(<HomeTileRow role="driver" />);

    // Em-dash placeholder appears in earnings + analytics tiles when data
    // isn't loaded yet; the referral tile shows it too.
    const placeholders = screen.getAllByText('—');
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: /copy referral link/i })).toBeNull();
  });
});

describe('HomeTileRow — agent', () => {
  it('shows driver payout total + posts count, and the referral code', () => {
    vi.mocked(useDriverAnalytics).mockReturnValue({ data: undefined, isPending: false } as never);
    vi.mocked(useAgentAnalytics).mockReturnValue({ data: agentAnalytics, isPending: false } as never);
    vi.mocked(useReferral).mockReturnValue({ data: referralView as never, isPending: false } as never);

    withRouter(<HomeTileRow role="agent" />);

    expect(screen.getByRole('link', { name: /earnings/i })).toHaveAttribute('href', '/analytics');
    expect(screen.getByText(/22 posted/)).toBeInTheDocument();
    expect(screen.getByText('RAVI23')).toBeInTheDocument();
  });
});

describe('HomeTileRow — referral copy', () => {
  it('copies the referral link without navigating when the copy button is tapped', async () => {
    vi.mocked(useDriverAnalytics).mockReturnValue({ data: driverAnalytics, isPending: false } as never);
    vi.mocked(useAgentAnalytics).mockReturnValue({ data: undefined, isPending: false } as never);
    vi.mocked(useReferral).mockReturnValue({ data: referralView as never, isPending: false } as never);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    withRouter(<HomeTileRow role="driver" />);

    fireEvent.click(screen.getByRole('button', { name: /copy referral link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(referralView.link));
    expect(toast.success).toHaveBeenCalledWith('Referral link copied');
  });
});
