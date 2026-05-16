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

const sampleLink = {
  id: 'lk1',
  referrerUserId: 'u0',
  referredUserId: 'u1',
  referredUserRole: 'driver' as const,
  status: 'qualified' as const,
  capPaise: 250000,
  payoutPerTripPaise: 5000,
  eligiblePaidTripsCount: 4,
  totalEarnedPaise: 20000,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  referredUser: { id: 'u1', role: 'driver' as const, displayName: 'Asha', phone: '+919876543210' },
  lastTripAt: '2026-04-01T12:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('ReferredUserTable', () => {
  it('renders rows with masked phone + drilldown link + earnings', async () => {
    vi.mocked(svc.getMyReferred).mockResolvedValue([sampleLink] as never);
    render(<Wrap><ReferredUserTable /></Wrap>);
    await waitFor(() => expect(screen.getByText('Asha')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Asha/ })).toHaveAttribute('href', '/referrals/lk1');
    expect(screen.getByText(/3210/)).toBeInTheDocument();
    expect(screen.getByText('₹200')).toBeInTheDocument();
    expect(screen.getByText('/ ₹2,500')).toBeInTheDocument();
  });

  it('changing role filter to Drivers refetches with role=driver', async () => {
    vi.mocked(svc.getMyReferred).mockResolvedValue([]);
    render(<Wrap><ReferredUserTable /></Wrap>);
    await waitFor(() => expect(svc.getMyReferred).toHaveBeenCalledWith(undefined));
    fireEvent.change(screen.getByLabelText(/filter referred users/i), { target: { value: 'driver' } });
    await waitFor(() => expect(svc.getMyReferred).toHaveBeenCalledWith({ role: 'driver' }));
  });

  it('shows the empty message when filtered list is empty', async () => {
    vi.mocked(svc.getMyReferred).mockResolvedValue([]);
    render(<Wrap><ReferredUserTable /></Wrap>);
    await waitFor(() => expect(screen.getByText(/No referrals match/i)).toBeInTheDocument());
  });

  it('client-side cap_reached filter narrows the list', async () => {
    vi.mocked(svc.getMyReferred).mockResolvedValue([
      sampleLink,
      { ...sampleLink, id: 'lk2', referredUser: { id: 'u2', role: 'driver', displayName: 'Bina' }, status: 'cap_reached' },
    ] as never);
    render(<Wrap><ReferredUserTable /></Wrap>);
    await waitFor(() => expect(screen.getByText('Asha')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/filter referred users/i), { target: { value: 'cap_reached' } });
    await waitFor(() => expect(screen.queryByText('Asha')).not.toBeInTheDocument());
    expect(screen.getByText('Bina')).toBeInTheDocument();
  });
});
