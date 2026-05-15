import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VacanciesPage } from '@/pages/VacanciesPage';
import { formatClockTime } from '@/lib/utils';
import type { Vacancy } from '@/types';

vi.mock('@/hooks/useVacancies', () => ({
  useVacancies: vi.fn(),
  useMyActiveVacancies: vi.fn(),
  useCancelVacancy: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
import { useVacancies, useMyActiveVacancies } from '@/hooks/useVacancies';
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() }, useAppSettings: vi.fn() }));
import { cityHooks, useAppSettings } from '@/hooks/useAdminConfig';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn() }));
import { useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/stores/roleViewStore', () => ({ useEffectiveRole: vi.fn() }));
import { useEffectiveRole } from '@/stores/roleViewStore';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeVacancy(over: Partial<Vacancy> = {}): Vacancy {
  return {
    id: 'v1',
    driverId: 'd1',
    driver: { id: 'd1', userId: 'u1', displayHandle: 'A1B2C3D', fullName: 'Ravi Kumar', profilePhotoUrl: '', ratingAvg: 4.7, ratingCount: 9, totalTripsCompleted: 30, topTags: [] },
    vehicleId: 'veh1',
    vehicle: { id: 'veh1', makeLabel: 'Toyota', modelName: 'Innova', year: 2021, carTypeLabel: 'Innova', seats: 7, ac: true },
    currentCity: city('c1', 'Vellore'),
    availableFrom: '2099-06-01T00:00:00.000Z',
    availableUntil: '2099-06-05T00:00:00.000Z',
    destinationCities: [city('c2', 'Chennai'), city('c3', 'Bangalore')],
    destinationPlaces: [],
    minRatePerKm: 18,
    notes: 'Long trips welcome.',
    status: 'active',
    createdAt: '2099-05-30T00:00:00.000Z',
    ...over,
  };
}

type VState = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; data?: Vacancy[]; refetch?: () => void };
function setVacancies(s: VState) {
  vi.mocked(useVacancies).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...s } as never);
}

function renderVacancies() {
  return render(
    <MemoryRouter>
      <VacanciesPage />
    </MemoryRouter>,
  );
}

describe('VacanciesPage', () => {
  beforeEach(() => {
    vi.mocked(useVacancies).mockReset();
    vi.mocked(useMyActiveVacancies).mockReset().mockReturnValue({ isPending: false, data: [] } as never);
    vi.mocked(cityHooks.useList).mockReset().mockReturnValue({ data: [city('c1', 'Vellore'), city('c2', 'Chennai')] } as never);
    vi.mocked(useAppSettings).mockReset().mockReturnValue({ data: { maxActiveVacanciesPerDriver: 2 } } as never);
    // Default to agent view: card hidden, button-area unchanged.
    vi.mocked(useEffectiveRole).mockReset().mockReturnValue('trip_manager');
    vi.mocked(useMyDriver).mockReset().mockReturnValue({ data: undefined } as never);
  });

  it('renders a skeleton while loading', () => {
    setVacancies({ isPending: true, isSuccess: false });
    renderVacancies();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on failure', () => {
    const refetch = vi.fn();
    setVacancies({ isError: true, isSuccess: false, refetch });
    renderVacancies();
    expect(screen.getByText(/couldn't load available drivers/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders an empty state when no drivers have posted', () => {
    setVacancies({ data: [] });
    renderVacancies();
    expect(screen.getByText(/no drivers have posted availability/i)).toBeInTheDocument();
  });

  it('renders a card per vacancy with the driver, destinations and a link to the profile', () => {
    setVacancies({ data: [makeVacancy()] });
    renderVacancies();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getAllByText('Chennai').length).toBeGreaterThan(0); // also a filter option
    expect(screen.getByText('Bangalore')).toBeInTheDocument(); // destination chip only
    expect(screen.getByText('Long trips welcome.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ravi kumar/i })).toHaveAttribute('href', '/drivers/d1');
  });

  it('shows the availability time window on the card', () => {
    const from = '2099-06-01T09:00:00.000Z';
    const to = '2099-06-01T13:00:00.000Z';
    setVacancies({ data: [makeVacancy({ availableFrom: from, availableUntil: to })] });
    renderVacancies();
    const t0 = formatClockTime(new Date(from));
    const t1 = formatClockTime(new Date(to));
    expect(screen.getAllByText((txt) => txt.includes(t0) && txt.includes(t1)).length).toBeGreaterThan(0);
  });

  it('always requests active vacancies and re-requests when a city filter changes', () => {
    setVacancies({ data: [] });
    renderVacancies();
    expect(useVacancies).toHaveBeenCalledWith({ status: 'active', currentCityId: undefined, destinationCityId: undefined });
    fireEvent.change(screen.getByLabelText(/where the driver is/i), { target: { value: 'c1' } });
    expect(useVacancies).toHaveBeenLastCalledWith({ status: 'active', currentCityId: 'c1', destinationCityId: undefined });
  });

  it('renders the "Near me" filter; a near-list card shows the distance', () => {
    setVacancies({ data: [makeVacancy({ distanceKm: 3.1 })] });
    renderVacancies();
    expect(screen.getByRole('button', { name: /near me/i })).toBeInTheDocument();
    expect(screen.getByText(/3\.1 km away/i)).toBeInTheDocument();
  });

  // ── role / limit gate for the "I'm available" hero card ─────────────────
  it('an agent (or admin viewing-as-agent) does NOT see the I\'m-available card', () => {
    vi.mocked(useEffectiveRole).mockReturnValue('trip_manager');
    vi.mocked(useMyDriver).mockReturnValue({ data: undefined } as never);
    setVacancies({ data: [] });
    renderVacancies();
    expect(screen.queryByTestId('i-am-available-card')).toBeNull();
    expect(screen.queryByRole('link', { name: /post vacant/i })).toBeNull();
  });

  it('a driver with a profile sees the card with the Post button enabled', () => {
    vi.mocked(useEffectiveRole).mockReturnValue('driver');
    vi.mocked(useMyDriver).mockReturnValue({ data: { id: 'd1' } } as never);
    vi.mocked(useMyActiveVacancies).mockReturnValue({ isPending: false, data: [] } as never);
    setVacancies({ data: [] });
    renderVacancies();
    expect(screen.getByTestId('i-am-available-card')).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 2 active/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post vacant/i })).toHaveAttribute('href', '/vacancies/new');
  });

  it('a driver at 2/2 active sees the card with the Post button disabled', () => {
    vi.mocked(useEffectiveRole).mockReturnValue('driver');
    vi.mocked(useMyDriver).mockReturnValue({ data: { id: 'd1' } } as never);
    vi.mocked(useMyActiveVacancies).mockReturnValue({
      isPending: false,
      data: [makeVacancy({ id: 'mine-1' }), makeVacancy({ id: 'mine-2' })],
    } as never);
    setVacancies({ data: [] });
    renderVacancies();
    expect(screen.getByText(/2 \/ 2 active — max reached/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /post vacant/i })).toBeNull();
    const btn = screen.getByRole('button', { name: /post vacant \(disabled/i });
    expect(btn).toBeDisabled();
  });
});
