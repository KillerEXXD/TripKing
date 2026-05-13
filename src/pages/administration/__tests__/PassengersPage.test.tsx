import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PassengersPage } from '@/pages/administration/PassengersPage';
import type { Passenger } from '@/types';

vi.mock('@/hooks/usePassengers', () => ({ useInfinitePassengers: vi.fn() }));
import { useInfinitePassengers } from '@/hooks/usePassengers';

function makePassenger(over: Partial<Passenger> = {}): Passenger {
  return {
    id: 'p1',
    phone: '+919876543210',
    name: 'Jane Sharma',
    aliases: [],
    referredByUserId: 'u9',
    referredBy: { id: 'u9', displayName: 'Agent A', role: 'trip_manager' },
    firstTripId: 't1',
    firstSeenAt: '2026-05-01T00:00:00.000Z',
    tripsCount: 4,
    ...over,
  };
}

interface PageMeta { page: number; limit: number; total: number; hasMore: boolean }
type State = { isPending?: boolean; isError?: boolean; rows?: Passenger[]; total?: number; hasNextPage?: boolean; refetch?: () => void };
function setPassengers(s: State = {}) {
  const rows = s.rows ?? [];
  const total = s.total ?? rows.length;
  vi.mocked(useInfinitePassengers).mockReturnValue({
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
  return render(
    <MemoryRouter>
      <PassengersPage />
    </MemoryRouter>,
  );
}

describe('PassengersPage', () => {
  beforeEach(() => vi.mocked(useInfinitePassengers).mockReset());

  it('renders a skeleton while loading', () => {
    setPassengers({ isPending: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on failure', () => {
    const refetch = vi.fn();
    setPassengers({ isError: true, refetch });
    renderPage();
    expect(screen.getByText(/couldn't load passengers/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders an empty state when there are no passengers', () => {
    setPassengers({ rows: [] });
    renderPage();
    expect(screen.getByText(/no passengers/i)).toBeInTheDocument();
  });

  it('shows the server total in the header', () => {
    setPassengers({ rows: [makePassenger()], total: 12345 });
    renderPage();
    expect(screen.getByText(/12,345 total/)).toBeInTheDocument();
  });

  it('lists passengers with name / phone / referrer / trip count, and filters by name, phone or alias', () => {
    setPassengers({
      rows: [
        makePassenger(),
        makePassenger({ id: 'p2', name: 'Ravi Kumar', phone: '+918888888888', aliases: ['Ravindra'], referredBy: { id: 'u3', displayName: 'Driver D', role: 'driver' }, tripsCount: 1 }),
      ],
    });
    renderPage();
    expect(screen.getByText('Jane Sharma')).toBeInTheDocument();
    expect(screen.getByText('+919876543210')).toBeInTheDocument();
    expect(screen.getByText(/agent a/i)).toBeInTheDocument(); // the referrer
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText(/also entered as: ravindra/i)).toBeInTheDocument();

    const search = screen.getByRole('textbox', { name: /search passengers/i });
    fireEvent.change(search, { target: { value: 'ravindra' } }); // alias match → only Ravi
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.queryByText('Jane Sharma')).toBeNull();

    fireEvent.change(search, { target: { value: '9876' } }); // phone match → only Jane
    expect(screen.getByText('Jane Sharma')).toBeInTheDocument();
    expect(screen.queryByText('Ravi Kumar')).toBeNull();
  });
});
