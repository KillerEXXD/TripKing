import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-referrals');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/admin-referrals';
import { AdminReferralsPage } from '@/pages/administration/AdminReferralsPage';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const linkFixture = {
  id: 'lk1', referrerUserId: 'u0', referredUserId: 'u1', referredUserRole: 'driver' as const,
  status: 'qualified' as const, capPaise: 250000, payoutPerTripPaise: 5000,
  eligiblePaidTripsCount: 4, totalEarnedPaise: 20000, createdAt: 'x', updatedAt: 'y',
  referredUser: { id: 'u1', role: 'driver' as const, displayName: 'Asha' },
};

describe('AdminReferralsPage', () => {
  it('lists referrals + status pill', async () => {
    vi.mocked(svc.getAdminReferrals).mockResolvedValue([linkFixture]);
    render(<Wrap><AdminReferralsPage /></Wrap>);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Asha' })).toBeInTheDocument());
    expect(screen.getByText('₹200')).toBeInTheDocument();
  });

  it('Set status calls patchAdminReferralStatus with the chosen value', async () => {
    vi.mocked(svc.getAdminReferrals).mockResolvedValue([linkFixture]);
    vi.mocked(svc.patchAdminReferralStatus).mockResolvedValue({ ...linkFixture, status: 'suspended' });
    render(<Wrap><AdminReferralsPage /></Wrap>);
    await waitFor(() => screen.getByRole('button', { name: /^Set$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Set$/ }));
    await waitFor(() => expect(svc.patchAdminReferralStatus).toHaveBeenCalledWith('lk1', 'suspended', undefined));
  });

  it('Reverse calls reverseAdminReferralEarnings', async () => {
    vi.mocked(svc.getAdminReferrals).mockResolvedValue([linkFixture]);
    vi.mocked(svc.reverseAdminReferralEarnings).mockResolvedValue({ reversedPaise: 20000 });
    render(<Wrap><AdminReferralsPage /></Wrap>);
    await waitFor(() => screen.getByRole('button', { name: /Reverse/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reverse/ }));
    await waitFor(() => expect(svc.reverseAdminReferralEarnings).toHaveBeenCalledWith('lk1', undefined));
  });
});
