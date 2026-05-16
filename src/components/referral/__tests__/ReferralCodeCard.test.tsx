import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/drivers');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import * as svc from '@/lib/api/services/drivers';
import { toast } from 'sonner';
import { ReferralCodeCard } from '@/components/referral/ReferralCodeCard';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('ReferralCodeCard', () => {
  it('renders the code and copy/share controls when API returns one', async () => {
    vi.mocked(svc.getMyDriver).mockResolvedValue({ referralCode: 'CODE1234' } as never);
    render(<Wrap><ReferralCodeCard role="driver" /></Wrap>);
    await waitFor(() => expect(screen.getByText('CODE1234')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /copy referral code/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute('href', expect.stringContaining('wa.me'));
  });

  it('clicking the code copy button writes to clipboard and toasts', async () => {
    vi.mocked(svc.getMyDriver).mockResolvedValue({ referralCode: 'CODE1234' } as never);
    render(<Wrap><ReferralCodeCard role="driver" /></Wrap>);
    await waitFor(() => screen.getByText('CODE1234'));
    fireEvent.click(screen.getByRole('button', { name: /copy referral code/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('CODE1234'));
    expect(toast.success).toHaveBeenCalledWith('Code copied');
  });

  it('renders nothing while the API has no code yet', async () => {
    vi.mocked(svc.getMyDriver).mockResolvedValue({} as never);
    const { container } = render(<Wrap><ReferralCodeCard role="driver" /></Wrap>);
    await waitFor(() => expect(svc.getMyDriver).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[aria-label="Your referral code"]')).toBeNull());
  });

  it('has no a11y violations', async () => {
    vi.mocked(svc.getMyDriver).mockResolvedValue({ referralCode: 'CODE1234' } as never);
    const { container } = render(<Wrap><ReferralCodeCard role="driver" /></Wrap>);
    await waitFor(() => screen.getByText('CODE1234'));
    expect(await axe(container)).toHaveNoViolations();
  });
});
