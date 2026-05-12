import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VacanciesPage } from '@/pages/VacanciesPage';
import type { Vacancy } from '@/types';

vi.mock('@/hooks/useVacancies', () => ({ useVacancies: vi.fn() }));
import { useVacancies } from '@/hooks/useVacancies';
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() } }));
import { cityHooks } from '@/hooks/useAdminConfig';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeVacancy(over: Partial<Vacancy> = {}): Vacancy {
  return {
    id: 'v1',
    driverId: 'd1',
    driver: { id: 'd1', fullName: 'Ravi Kumar', profilePhotoUrl: '', ratingAvg: 4.7, ratingCount: 9, totalTripsCompleted: 30, topTags: [] },
    vehicleId: 'veh1',
    vehicle: { id: 'veh1', makeLabel: 'Toyota', modelName: 'Innova', year: 2021, carTypeLabel: 'Innova', seats: 7, ac: true },
    currentCity: city('c1', 'Vellore'),
    availableFrom: '2099-06-01T00:00:00.000Z',
    availableUntil: '2099-06-05T00:00:00.000Z',
    destinationCities: [city('c2', 'Chennai'), city('c3', 'Bangalore')],
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
    vi.mocked(cityHooks.useList).mockReset().mockReturnValue({ data: [city('c1', 'Vellore'), city('c2', 'Chennai')] } as never);
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
    expect(screen.getByRole('link')).toHaveAttribute('href', '/drivers/d1');
  });

  it('always requests active vacancies and re-requests when a city filter changes', () => {
    setVacancies({ data: [] });
    renderVacancies();
    expect(useVacancies).toHaveBeenCalledWith({ status: 'active', currentCityId: undefined, destinationCityId: undefined });
    fireEvent.change(screen.getByLabelText(/where the driver is/i), { target: { value: 'c1' } });
    expect(useVacancies).toHaveBeenLastCalledWith({ status: 'active', currentCityId: 'c1', destinationCityId: undefined });
  });
});
