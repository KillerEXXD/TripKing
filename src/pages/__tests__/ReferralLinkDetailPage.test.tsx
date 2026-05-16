import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
import * as svc from '@/lib/api/services/referrals';
import { ReferralLinkDetailPage } from '@/pages/ReferralLinkDetailPage';

function Wrap({ children, path = '/referrals/lk1' }: { children: ReactNode; path?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/referrals/:linkId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ReferralLinkDetailPage', () => {
  it('renders summary stats + per-trip ledger row with trip link', async () => {
    vi.mocked(svc.getReferralLink).mockResolvedValue({
      link: {
        id: 'lk1', referrerUserId: 'u0', referredUserId: 'u1', referredUserRole: 'driver',
        status: 'qualified', capPaise: 250000, payoutPerTripPaise: 5000,
        eligiblePaidTripsCount: 4, totalEarnedPaise: 20000,
        createdAt: 'x', updatedAt: 'y',
        referredUser: { id: 'u1', role: 'driver', displayName: 'Asha' },
      },
      ledger: [
        { id: 'l1', entryType: 'accrual', amountPaise: 5000, createdAt: '2026-01-05T10:00:00Z', trip: { id: 't1', fromCityName: 'Vellore', toCityName: 'Chennai' }, fee: { side: 'driver', paymentSource: 'cash_wallet' } },
      ],
    });
    render(<Wrap><ReferralLinkDetailPage /></Wrap>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Asha' })).toBeInTheDocument());
    expect(screen.getByText('₹200')).toBeInTheDocument(); // earned
    expect(screen.getByText('₹2,300')).toBeInTheDocument(); // cap remaining 230000 paise
    expect(screen.getByRole('link', { name: /Vellore → Chennai/i })).toHaveAttribute('href', '/trips/t1');
  });
});
