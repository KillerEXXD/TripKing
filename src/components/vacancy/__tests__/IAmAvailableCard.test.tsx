import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IAmAvailableCard } from '@/components/vacancy/IAmAvailableCard';
import type { Vacancy } from '@/types';

vi.mock('@/hooks/useVacancies', () => ({ useMyActiveVacancies: vi.fn() }));
import { useMyActiveVacancies } from '@/hooks/useVacancies';

function vacancy(id: string): Vacancy {
  return {
    id,
    driverId: 'd1',
    currentCity: { id: 'c1', name: 'Vellore', state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true },
    availableFrom: '2099-06-01T00:00:00.000Z',
    destinationCities: [],
    destinationPlaces: [],
    status: 'active',
    createdAt: '2099-05-30T00:00:00.000Z',
  } as Vacancy;
}

type State = { isPending?: boolean; data?: Vacancy[] };
function setState(s: State) {
  vi.mocked(useMyActiveVacancies).mockReturnValue({ isPending: false, data: [], ...s } as never);
}

function renderCard() {
  return render(
    <MemoryRouter>
      <IAmAvailableCard driverId="d1" />
    </MemoryRouter>,
  );
}

describe('IAmAvailableCard', () => {
  beforeEach(() => {
    vi.mocked(useMyActiveVacancies).mockReset();
  });

  it('renders 0/2 with the empty-state subtitle and an enabled Post button', () => {
    setState({ data: [] });
    renderCard();
    expect(screen.getByText(/I'm available/i)).toBeInTheDocument();
    expect(screen.getByText(/Let agents find you/i)).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 2 active/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /post availability/i });
    expect(link).toHaveAttribute('href', '/vacancies/new');
  });

  it('renders 1/2 with the "listed in one city" subtitle', () => {
    setState({ data: [vacancy('v1')] });
    renderCard();
    expect(screen.getByText(/listed in one city/i)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2 active/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post availability/i })).toBeInTheDocument();
  });

  it('renders 2/2 with the Post button disabled + tooltip + "max reached" label', () => {
    setState({ data: [vacancy('v1'), vacancy('v2')] });
    renderCard();
    expect(screen.getByText(/2 \/ 2 active — max reached/)).toBeInTheDocument();
    // No link to /vacancies/new when at the limit
    expect(screen.queryByRole('link', { name: /post availability/i })).toBeNull();
    const btn = screen.getByRole('button', { name: /post availability \(disabled/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringContaining('Max 2 active vacancies'));
  });

  it('renders the loading placeholder while the query is pending', () => {
    setState({ isPending: true, data: undefined });
    renderCard();
    expect(screen.getByText(/— \/ 2 active/)).toBeInTheDocument();
  });
});
