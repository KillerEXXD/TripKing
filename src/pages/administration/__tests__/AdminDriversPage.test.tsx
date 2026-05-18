import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminDriversPage } from '@/pages/administration/AdminDriversPage';
import type { Driver } from '@/types';

vi.mock('@/hooks/useDrivers', () => ({ useInfiniteDrivers: vi.fn() }));
import { useInfiniteDrivers } from '@/hooks/useDrivers';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeDriver(over: Partial<Driver> = {}): Driver {
  return {
    id: 'd1',
    userId: 'u1',
    fullName: 'Ravi Kumar',
    displayHandle: 'A1B2C3D', canReportBugs: false,
    phone: '+919876500000',
    homeCity: city('c1', 'Vellore'),
    currentCity: city('c1', 'Vellore'),
    profilePhotoUrl: '',
    kycStatus: 'approved',
    ratingAvg: 4.7,
    ratingCount: 9,
    ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    topTags: [],
    managerTopTags: [],
    totalTripsCompleted: 20,
    vehicles: [{ id: 'v1', year: 2021, seats: 5, ac: true, carTypeLabel: 'Sedan' }],
    ...over,
  } as Driver;
}

interface PageMeta { page: number; limit: number; total: number; hasMore: boolean }
type State = { isPending?: boolean; isError?: boolean; rows?: Driver[]; total?: number; hasNextPage?: boolean; isFetchingNextPage?: boolean };
function setDrivers(s: State = {}) {
  const rows = s.rows ?? [];
  const total = s.total ?? rows.length;
  vi.mocked(useInfiniteDrivers).mockReturnValue({
    isPending: s.isPending ?? false,
    isError: s.isError ?? false,
    data: s.isPending || s.isError ? undefined : { pages: [{ data: rows, meta: { page: 1, limit: 50, total, hasMore: s.hasNextPage ?? false } as PageMeta }], pageParams: [1] },
    hasNextPage: s.hasNextPage ?? false,
    isFetchingNextPage: s.isFetchingNextPage ?? false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  } as never);
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><AdminDriversPage /></MemoryRouter></QueryClientProvider>);
}

describe('AdminDriversPage', () => {
  beforeEach(() => {
    vi.mocked(useInfiniteDrivers).mockReset();
    setDrivers({ rows: [] });
  });

  it('lists drivers with their KYC badge, rating and a profile link', () => {
    setDrivers({ rows: [makeDriver(), makeDriver({ id: 'd2', userId: 'u2', fullName: 'Suresh P', displayHandle: 'A1B2C3D', canReportBugs: false, kycStatus: 'pending', ratingCount: 0, totalTripsCompleted: 0, vehicles: [] })] });
    renderPage();
    expect(screen.getByRole('heading', { name: /^drivers$/i })).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('Verified', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(screen.getByText(/9 reviews/)).toBeInTheDocument();
    expect(screen.getByText('Suresh P')).toBeInTheDocument();
    expect(screen.getByText('Pending', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    // The whole card body is a link to /drivers/:id; KYC shortcut sits next to it.
    const profileLinks = screen.getAllByRole('link').filter((el) => el.getAttribute('href')?.startsWith('/app/drivers/'));
    expect(profileLinks.length).toBeGreaterThanOrEqual(2);
    expect(profileLinks[0]).toHaveAttribute('href', '/app/drivers/d1');
  });

  it('shows the total count from the server in the header', () => {
    setDrivers({ rows: [makeDriver()], total: 1234 });
    renderPage();
    expect(screen.getByText(/1,234 total/)).toBeInTheDocument();
  });

  it('forwards the (debounced) search box to the server as a `search` param', () => {
    vi.useFakeTimers();
    try {
      setDrivers({ rows: [makeDriver()] });
      renderPage();
      fireEvent.change(screen.getByLabelText(/search drivers/i), { target: { value: 'suresh' } });
      act(() => { vi.advanceTimersByTime(300); });
      const calls = vi.mocked(useInfiniteDrivers).mock.calls;
      const last = calls[calls.length - 1];
      expect((last[0] as { search?: string }).search).toBe('suresh');
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to All and a KYC chip narrows the server query', () => {
    setDrivers({ rows: [makeDriver()] });
    renderPage();
    const lastCallArgs = () => {
      const calls = vi.mocked(useInfiniteDrivers).mock.calls;
      return calls[calls.length - 1];
    };
    // initial render: no kycStatus (filter=all → undefined), page size 50
    expect(lastCallArgs()).toEqual([undefined, 50]);
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }));
    expect(lastCallArgs()).toEqual([{ kycStatus: 'pending' }, 50]);
  });

  it('shows loading, error and empty states', () => {
    setDrivers({ isPending: true });
    const { rerender } = renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    setDrivers({ isError: true });
    rerender(<MemoryRouter><AdminDriversPage /></MemoryRouter>);
    expect(screen.getByText(/couldn't load drivers/i)).toBeInTheDocument();
    setDrivers({ rows: [] });
    rerender(<MemoryRouter><AdminDriversPage /></MemoryRouter>);
    expect(screen.getByText('No drivers')).toBeInTheDocument();
  });
});
