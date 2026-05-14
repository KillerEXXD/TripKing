import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KycReviewPage } from '@/pages/administration/KycReviewPage';

vi.mock('@/hooks/useDrivers', () => ({
  useInfiniteDrivers: vi.fn(),
  useInfiniteAgents: vi.fn(),
}));
import { useInfiniteAgents, useInfiniteDrivers } from '@/hooks/useDrivers';

type InfState = { isPending?: boolean; isError?: boolean; rows?: unknown[]; hasNextPage?: boolean; refetch?: () => void };
function infState(s: InfState = {}) {
  return {
    isPending: s.isPending ?? false,
    isError: s.isError ?? false,
    data: { pages: [{ data: s.rows ?? [], meta: { page: 1, limit: 50, total: (s.rows ?? []).length, hasMore: !!s.hasNextPage } }] },
    hasNextPage: !!s.hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: s.refetch ?? vi.fn(),
  } as never;
}
function setDrivers(s: InfState = {}) { vi.mocked(useInfiniteDrivers).mockReturnValue(infState(s)); }
function setAgents(s: InfState = {}) { vi.mocked(useInfiniteAgents).mockReturnValue(infState(s)); }

function renderKyc() {
  return render(
    <MemoryRouter>
      <KycReviewPage />
    </MemoryRouter>,
  );
}

describe('KycReviewPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useInfiniteDrivers).mockReset();
    vi.mocked(useInfiniteAgents).mockReset();
    setDrivers();
    setAgents();
  });

  it('shows a skeleton while drivers load', () => {
    setDrivers({ isPending: true });
    renderKyc();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows an error state with retry when drivers fail to load', () => {
    const refetch = vi.fn();
    setDrivers({ isError: true, refetch });
    renderKyc();
    expect(screen.getByText(/couldn't load drivers/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('passes the "needs review" kycStatus CSV (incl. ready_for_approval) to the server by default', () => {
    setDrivers({ rows: [{ id: 'd1', fullName: 'X', kycStatus: 'docs_submitted' }] });
    renderKyc();
    const lastCall = vi.mocked(useInfiniteDrivers).mock.calls[vi.mocked(useInfiniteDrivers).mock.calls.length-1];
    expect(lastCall[0]).toMatchObject({ kycStatus: ['pending', 'docs_submitted', 'video_pending', 'ready_for_approval', 'resubmit_required'] });
    expect(lastCall[0]).not.toHaveProperty('search');
  });

  it('cards are links to the per-applicant detail page (driver)', () => {
    setDrivers({ rows: [{ id: 'd1', fullName: 'Ravi', kycStatus: 'docs_submitted' }] });
    renderKyc();
    const link = screen.getByRole('link', { name: /ravi/i });
    expect(link).toHaveAttribute('href', '/administration/kyc/driver/d1');
  });

  it('switching to the Agents tab shows agent cards linking to the agent detail page', () => {
    setAgents({ rows: [{ id: 'a1', fullName: 'Agent X', businessName: 'X Travels', kycStatus: 'pending' }] });
    renderKyc();
    fireEvent.click(screen.getByRole('tab', { name: /^agents$/i }));
    const link = screen.getByRole('link', { name: /agent x/i });
    expect(link).toHaveAttribute('href', '/administration/kyc/agent/a1');
  });

  it('clicking the "Approved" filter sends kycStatus="approved" to the server', () => {
    setDrivers({ rows: [] });
    renderKyc();
    fireEvent.click(screen.getByRole('tab', { name: /^approved$/i }));
    const lastCall = vi.mocked(useInfiniteDrivers).mock.calls[vi.mocked(useInfiniteDrivers).mock.calls.length-1];
    expect(lastCall[0]).toMatchObject({ kycStatus: 'approved' });
  });

  it('clicking the "Ready for approval" filter sends kycStatus="ready_for_approval"', () => {
    setDrivers({ rows: [] });
    renderKyc();
    fireEvent.click(screen.getByRole('tab', { name: /ready for approval/i }));
    const lastCall = vi.mocked(useInfiniteDrivers).mock.calls[vi.mocked(useInfiniteDrivers).mock.calls.length-1];
    expect(lastCall[0]).toMatchObject({ kycStatus: 'ready_for_approval' });
  });

  it('debounces the search input and forwards it as `search` after 300ms', () => {
    setDrivers({ rows: [] });
    renderKyc();
    fireEvent.change(screen.getByLabelText(/search kyc queue/i), { target: { value: 'ravi' } });
    act(() => { vi.advanceTimersByTime(300); });
    const afterCall = vi.mocked(useInfiniteDrivers).mock.calls[vi.mocked(useInfiniteDrivers).mock.calls.length-1];
    expect((afterCall[0] as { search?: string }).search).toBe('ravi');
  });

  it('search applies to the agents queue too', () => {
    setAgents({ rows: [] });
    renderKyc();
    fireEvent.click(screen.getByRole('tab', { name: /^agents$/i }));
    fireEvent.change(screen.getByLabelText(/search kyc queue/i), { target: { value: 'y@ex' } });
    act(() => { vi.advanceTimersByTime(300); });
    const lastCall = vi.mocked(useInfiniteAgents).mock.calls[vi.mocked(useInfiniteAgents).mock.calls.length-1];
    expect(lastCall[0]).toMatchObject({ search: 'y@ex' });
  });

  it('shows an empty state when no entries match', () => {
    setDrivers({ rows: [] });
    renderKyc();
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
  });

  it('shows a search-specific empty message when the server returns nothing for a query', () => {
    setDrivers({ rows: [] });
    renderKyc();
    fireEvent.change(screen.getByLabelText(/search kyc queue/i), { target: { value: 'zzzzz' } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText(/no drivers match that search/i)).toBeInTheDocument();
  });
});
