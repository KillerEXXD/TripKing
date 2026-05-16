import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/referrals');
import * as svc from '@/lib/api/services/referrals';
import { ReferredUserTable } from '@/components/referral/ReferredUserTable';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ReferredUserTable', () => {
  it('renders rows + drilldown link', async () => {
    vi.mocked(svc.getMyReferred).mockResolvedValue([
      { id: 'lk1', referrerUserId: 'u0', referredUserId: 'u1', referredUserRole: 'driver', status: 'qualified', capPaise: 250000, payoutPerTripPaise: 5000, eligiblePaidTripsCount: 4, totalEarnedPaise: 20000, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', referredUser: { id: 'u1', role: 'driver', displayName: 'Asha' } } as never,
    ]);
    render(<Wrap><ReferredUserTable /></Wrap>);
    await waitFor(() => expect(screen.getByText('Asha')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Asha' })).toHaveAttribute('href', '/referrals/lk1');
    expect(screen.getByText('₹200')).toBeInTheDocument(); // earned 20000 paise
  });

  it('changing the role filter refetches with role param', async () => {
    vi.mocked(svc.getMyReferred).mockResolvedValue([]);
    render(<Wrap><ReferredUserTable /></Wrap>);
    await waitFor(() => expect(svc.getMyReferred).toHaveBeenCalledWith(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'driver' }));
    await waitFor(() => expect(svc.getMyReferred).toHaveBeenCalledWith({ role: 'driver' }));
  });

  it('shows the empty message when filtered list is empty', async () => {
    vi.mocked(svc.getMyReferred).mockResolvedValue([]);
    render(<Wrap><ReferredUserTable /></Wrap>);
    await waitFor(() => expect(screen.getByText(/No referred users match/i)).toBeInTheDocument());
  });
});
