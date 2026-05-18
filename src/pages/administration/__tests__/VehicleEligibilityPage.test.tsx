import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VehicleEligibilityPage } from '@/pages/administration/VehicleEligibilityPage';

vi.mock('@/hooks/useVehicles', () => ({ useInfiniteAdminVehicles: vi.fn() }));
import { useInfiniteAdminVehicles } from '@/hooks/useVehicles';

interface PageMeta { page: number; limit: number; total: number; hasMore: boolean }
type State = { isPending?: boolean; isError?: boolean; rows?: unknown[]; total?: number; hasNextPage?: boolean; refetch?: () => void };
function setVehicles(s: State = {}) {
  const rows = s.rows ?? [];
  const total = s.total ?? rows.length;
  vi.mocked(useInfiniteAdminVehicles).mockReturnValue({
    isPending: s.isPending ?? false,
    isError: s.isError ?? false,
    data: s.isPending || s.isError ? undefined : { pages: [{ data: rows, meta: { page: 1, limit: 50, total, hasMore: s.hasNextPage ?? false } as PageMeta }], pageParams: [1] },
    hasNextPage: s.hasNextPage ?? false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: s.refetch ?? vi.fn(),
  } as never);
}
const vehicle = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  driverId: 'd1',
  makeLabel: 'Toyota',
  modelName: 'Innova',
  year: 2014,
  carTypeId: 'ct1',
  carTypeLabel: 'Innova',
  seats: 7,
  ac: true,
  registrationNumber: 'TN01AB1234',
  photoFrontUrl: '',
  photoBackUrl: '',
  photoLeftUrl: '',
  photoRightUrl: '',
  rcBookUrl: '',
  insuranceUrl: '',
  isPrimary: true,
  isActive: true,
  eligibilityStatus: 'expired',
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <VehicleEligibilityPage />
    </MemoryRouter>,
  );
}

describe('VehicleEligibilityPage', () => {
  beforeEach(() => {
    vi.mocked(useInfiniteAdminVehicles).mockReset();
    setVehicles({ rows: [] });
  });

  it('shows a skeleton while vehicles load', () => {
    setVehicles({ isPending: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    setVehicles({ isError: true, refetch });
    renderPage();
    expect(screen.getByText(/couldn't load vehicles/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('defaults to the "all" filter (server-side)', () => {
    setVehicles({ rows: [] });
    renderPage();
    expect(useInfiniteAdminVehicles).toHaveBeenCalledWith({ includeInactive: true }, 50);
  });

  it('changing the filter re-queries with the new params', () => {
    setVehicles({ rows: [] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^expired$/i }));
    expect(useInfiniteAdminVehicles).toHaveBeenLastCalledWith({ eligibility: ['expired'], includeInactive: true }, 50);
    fireEvent.click(screen.getByRole('button', { name: /needs attention/i }));
    expect(useInfiniteAdminVehicles).toHaveBeenLastCalledWith({ needsAttention: true, includeInactive: true }, 50);
  });

  it('shows the server total in the header', () => {
    setVehicles({ rows: [vehicle()], total: 999 });
    renderPage();
    expect(screen.getByText(/999 total/)).toBeInTheDocument();
  });

  it('renders a card per vehicle with its eligibility badge and a link to the driver', () => {
    setVehicles({ rows: [vehicle({ insuranceExpiry: '2024-12-31T00:00:00Z' })] });
    renderPage();
    expect(screen.getByText(/Toyota Innova 2014/)).toBeInTheDocument();
    expect(screen.getByText('TN01AB1234')).toBeInTheDocument();
    expect(screen.getAllByText('Expired').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: /view driver profile/i })).toHaveAttribute('href', '/app/drivers/d1');
  });

  it('shows an empty state when nothing matches', () => {
    setVehicles({ rows: [] });
    renderPage();
    expect(screen.getByText(/nothing to show/i)).toBeInTheDocument();
  });

  it('the search box narrows the loaded list by registration or make / model', () => {
    setVehicles({
      rows: [
        vehicle(),
        vehicle({ id: 'v2', driverId: 'd2', makeLabel: 'Maruti', modelName: 'Dzire', year: 2020, registrationNumber: 'TN09XY9999', eligibilityStatus: 'eligible' }),
      ],
    });
    renderPage();
    const search = screen.getByLabelText(/search vehicles/i);

    fireEvent.change(search, { target: { value: 'tn09' } });
    expect(screen.queryByText(/Toyota Innova/)).toBeNull();
    expect(screen.getByText(/Maruti Dzire/)).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'innova' } });
    expect(screen.getByText(/Toyota Innova/)).toBeInTheDocument();
    expect(screen.queryByText(/Maruti Dzire/)).toBeNull();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText(/no vehicles match that search/i)).toBeInTheDocument();
  });
});
