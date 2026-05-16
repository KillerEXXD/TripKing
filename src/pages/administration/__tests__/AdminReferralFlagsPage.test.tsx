import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-referrals');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/admin-referrals';
import { AdminReferralFlagsPage } from '@/pages/administration/AdminReferralFlagsPage';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AdminReferralFlagsPage', () => {
  it('lists open flags by default', async () => {
    vi.mocked(svc.getAdminFraudFlags).mockResolvedValue([
      { id: 'f1', referralLinkId: 'lk1', flagType: 'duplicate_aadhaar', severity: 'high', autoDetected: true, createdAt: '2026-01-01T00:00:00Z' } as never,
    ]);
    render(<Wrap><AdminReferralFlagsPage /></Wrap>);
    await waitFor(() => expect(screen.getByText(/duplicate aadhaar/i)).toBeInTheDocument());
    expect(svc.getAdminFraudFlags).toHaveBeenCalledWith({ resolved: false });
    expect(screen.getByRole('link', { name: /View referral/i })).toHaveAttribute('href', '/referrals/lk1');
  });

  it('Resolve calls resolveAdminFraudFlag with the entered note', async () => {
    vi.mocked(svc.getAdminFraudFlags).mockResolvedValue([
      { id: 'f1', referralLinkId: 'lk1', flagType: 'manual', severity: 'medium', autoDetected: false, createdAt: '2026-01-01T00:00:00Z' } as never,
    ]);
    vi.mocked(svc.resolveAdminFraudFlag).mockResolvedValue({ id: 'f1' } as never);
    render(<Wrap><AdminReferralFlagsPage /></Wrap>);
    const noteInput = await screen.findByPlaceholderText(/Resolution note/i);
    fireEvent.change(noteInput, { target: { value: 'looks fine' } });
    fireEvent.click(screen.getByRole('button', { name: /^Resolve$/ }));
    await waitFor(() => expect(svc.resolveAdminFraudFlag).toHaveBeenCalledWith('f1', 'looks fine'));
  });

  it('switching to Resolved filter refetches with resolved=true', async () => {
    vi.mocked(svc.getAdminFraudFlags).mockResolvedValue([]);
    render(<Wrap><AdminReferralFlagsPage /></Wrap>);
    await waitFor(() => expect(svc.getAdminFraudFlags).toHaveBeenCalledWith({ resolved: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    await waitFor(() => expect(svc.getAdminFraudFlags).toHaveBeenCalledWith({ resolved: true }));
  });
});
