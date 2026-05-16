import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-stage5');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/admin-stage5';
import { AdminListEditor } from '@/components/admin/AdminListEditor';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('AdminListEditor', () => {
  it('renders rows in a table with the configured columns', async () => {
    vi.mocked(svc.listAdminRows).mockResolvedValue([{ id: 't1', name: 'Tier 1', cap_paise: 250000 }]);
    render(<Wrap><AdminListEditor listKey="referral-tiers" itemNoun="tier" columns={['name', 'cap_paise']} /></Wrap>);
    await waitFor(() => expect(screen.getByText('Tier 1')).toBeInTheDocument());
    expect(screen.getByText('250000')).toBeInTheDocument();
  });

  it('shows the empty message when the list is empty', async () => {
    vi.mocked(svc.listAdminRows).mockResolvedValue([]);
    render(<Wrap><AdminListEditor listKey="referral-tiers" itemNoun="tier" columns={['name']} /></Wrap>);
    await waitFor(() => expect(screen.getByText(/No tiers yet/i)).toBeInTheDocument());
  });

  it('Add button calls createAdminRow with the form contents', async () => {
    vi.mocked(svc.listAdminRows).mockResolvedValue([]);
    vi.mocked(svc.createAdminRow).mockResolvedValue({ id: 'x' });
    render(<Wrap><AdminListEditor listKey="referral-tiers" itemNoun="tier" columns={['name']} /></Wrap>);
    await waitFor(() => screen.getByRole('button', { name: /add/i }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Tier 9' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(svc.createAdminRow).toHaveBeenCalledWith('referral-tiers', { name: 'Tier 9' }));
  });
});
