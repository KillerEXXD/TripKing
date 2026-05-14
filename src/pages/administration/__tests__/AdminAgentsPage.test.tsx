import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminAgentsPage } from '@/pages/administration/AdminAgentsPage';
import type { Agent } from '@/types';

vi.mock('@/hooks/useDrivers', () => ({ useInfiniteAgents: vi.fn() }));
import { useInfiniteAgents } from '@/hooks/useDrivers';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    userId: 'u1',
    fullName: 'Priya Ramesh',
    displayHandle: 'A1B2C3D', canReportBugs: false,
    phone: '+919876500000',
    email: 'priya@example.com',
    businessName: 'Priya Travels',
    businessCity: city('c1', 'Vellore'),
    profilePhotoUrl: '',
    kycStatus: 'approved',
    topTags: [],
    totalTripsPosted: 12,
    ...over,
  } as Agent;
}

interface PageMeta { page: number; limit: number; total: number; hasMore: boolean }
type State = { isPending?: boolean; isError?: boolean; rows?: Agent[]; total?: number; hasNextPage?: boolean; refetch?: () => void };
function setAgents(s: State = {}) {
  const rows = s.rows ?? [];
  const total = s.total ?? rows.length;
  vi.mocked(useInfiniteAgents).mockReturnValue({
    isPending: s.isPending ?? false,
    isError: s.isError ?? false,
    data: s.isPending || s.isError ? undefined : { pages: [{ data: rows, meta: { page: 1, limit: 50, total, hasMore: s.hasNextPage ?? false } as PageMeta }], pageParams: [1] },
    hasNextPage: s.hasNextPage ?? false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: s.refetch ?? vi.fn(),
  } as never);
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><AdminAgentsPage /></MemoryRouter></QueryClientProvider>);
}

describe('AdminAgentsPage', () => {
  beforeEach(() => {
    vi.mocked(useInfiniteAgents).mockReset();
    setAgents({ rows: [] });
  });

  it('lists agents with KYC badge, business, trips and a KYC link', () => {
    setAgents({
      rows: [
        makeAgent(),
        makeAgent({ id: 'a2', userId: 'u2', fullName: 'Suresh P', displayHandle: 'A2B2C3D', canReportBugs: false, kycStatus: 'pending', businessName: 'SP Tours', totalTripsPosted: 0 }),
      ],
    });
    renderPage();
    expect(screen.getByRole('heading', { name: /^agents$/i })).toBeInTheDocument();
    expect(screen.getByText('Priya Ramesh')).toBeInTheDocument();
    expect(screen.getByText('Verified', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(screen.getByText(/12 trips posted/i)).toBeInTheDocument();
    expect(screen.getByText('Suresh P')).toBeInTheDocument();
    expect(screen.getByText('Pending', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    const rowKycLinks = screen.getAllByRole('link', { name: /kyc →/i });
    expect(rowKycLinks[0]).toHaveAttribute('href', '/administration/kyc?agentId=a1');
    expect(rowKycLinks[1]).toHaveAttribute('href', '/administration/kyc?agentId=a2');
  });

  it('shows the server total in the header', () => {
    setAgents({ rows: [makeAgent()], total: 567 });
    renderPage();
    expect(screen.getByText(/567 total/)).toBeInTheDocument();
  });

  it('forwards the (debounced) search box to the server as a `search` param', () => {
    vi.useFakeTimers();
    try {
      setAgents({ rows: [makeAgent()] });
      renderPage();
      fireEvent.change(screen.getByLabelText(/search agents/i), { target: { value: 'suresh' } });
      act(() => { vi.advanceTimersByTime(300); });
      const calls = vi.mocked(useInfiniteAgents).mock.calls;
      const last = calls[calls.length - 1];
      expect((last[0] as { search?: string }).search).toBe('suresh');
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to All and a KYC chip narrows the server query', () => {
    setAgents({ rows: [makeAgent()] });
    renderPage();
    const lastCallArgs = () => {
      const calls = vi.mocked(useInfiniteAgents).mock.calls;
      return calls[calls.length - 1];
    };
    expect(lastCallArgs()).toEqual([undefined, 50]);
    fireEvent.click(screen.getByRole('button', { name: 'Docs in' }));
    expect(lastCallArgs()).toEqual([{ kycStatus: 'docs_submitted' }, 50]);
  });

  it('shows loading, error and empty states', () => {
    setAgents({ isPending: true });
    const { rerender } = renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();

    const refetch = vi.fn();
    setAgents({ isError: true, refetch });
    rerender(<MemoryRouter><AdminAgentsPage /></MemoryRouter>);
    expect(screen.getByText(/couldn't load agents/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();

    setAgents({ rows: [] });
    rerender(<MemoryRouter><AdminAgentsPage /></MemoryRouter>);
    expect(screen.getByText('No agents')).toBeInTheDocument();
  });
});
