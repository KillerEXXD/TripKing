import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VehicleEligibilityPage } from '@/pages/administration/VehicleEligibilityPage';

vi.mock('@/hooks/useVehicles', () => ({ useAdminVehicles: vi.fn() }));
import { useAdminVehicles } from '@/hooks/useVehicles';

type VState = { isPending?: boolean; isError?: boolean; data?: unknown[]; refetch?: () => void };
function setVehicles(s: VState = {}) {
  vi.mocked(useAdminVehicles).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
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
    vi.mocked(useAdminVehicles).mockReset();
    setVehicles({ data: [] });
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

  it('defaults to the "needs attention" filter (server-side)', () => {
    setVehicles({ data: [] });
    renderPage();
    expect(useAdminVehicles).toHaveBeenCalledWith({ needsAttention: true, includeInactive: true });
  });

  it('changing the filter re-queries with the new params', () => {
    setVehicles({ data: [] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^expired$/i }));
    expect(useAdminVehicles).toHaveBeenLastCalledWith({ eligibility: ['expired'], includeInactive: true });
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    expect(useAdminVehicles).toHaveBeenLastCalledWith({ includeInactive: true });
  });

  it('renders a card per vehicle with its eligibility badge and a link to the driver', () => {
    setVehicles({ data: [vehicle({ insuranceExpiry: '2024-12-31T00:00:00Z' })] });
    renderPage();
    expect(screen.getByText(/Toyota Innova 2014/)).toBeInTheDocument();
    expect(screen.getByText('TN01AB1234')).toBeInTheDocument();
    // "Expired" appears as the eligibility badge (and as the filter chip) — at least the badge
    expect(screen.getAllByText('Expired').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: /view driver profile/i })).toHaveAttribute('href', '/drivers/d1');
  });

  it('shows an empty state when nothing matches', () => {
    setVehicles({ data: [] });
    renderPage();
    expect(screen.getByText(/nothing to show/i)).toBeInTheDocument();
  });
});
