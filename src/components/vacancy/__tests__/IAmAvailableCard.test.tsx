import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IAmAvailableCard } from '@/components/vacancy/IAmAvailableCard';
import type { Vacancy } from '@/types';

vi.mock('@/hooks/useVacancies', () => ({
  useMyActiveVacancies: vi.fn(),
  useCancelVacancy: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
import { useMyActiveVacancies } from '@/hooks/useVacancies';
vi.mock('@/hooks/useAdminConfig', () => ({ useAppSettings: vi.fn() }));
import { useAppSettings } from '@/hooks/useAdminConfig';

function setAppSettings(max: number | undefined): void {
  vi.mocked(useAppSettings).mockReturnValue({
    isPending: false,
    data: max === undefined ? undefined : { maxActiveVacanciesPerDriver: max },
  } as never);
}

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
    vi.mocked(useAppSettings).mockReset();
    setAppSettings(2); // matches DB default; tests that need a different max override per case
  });

  it('renders 0/2 with the empty-state subtitle and an enabled Post button', () => {
    setState({ data: [] });
    renderCard();
    expect(screen.getByText(/I'm vacant/i)).toBeInTheDocument();
    expect(screen.getByText(/Let agents find you/i)).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 2 active/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /post vacant/i });
    expect(link).toHaveAttribute('href', '/vacancies/new');
  });

  it('renders 1/2 with the "each posting below is live" subtitle', () => {
    setState({ data: [vacancy('v1')] });
    renderCard();
    expect(screen.getByText(/each posting below is live/i)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2 active/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post vacant/i })).toBeInTheDocument();
  });

  it('starts collapsed with ≥1 vacancy and toggles open/closed when the header is clicked', () => {
    setState({ data: [vacancy('v1')] });
    renderCard();
    // The whole header is the toggle (role="button"); the only header-level button is the toggle itself.
    const toggle = screen.getByRole('button', { name: /i'm vacant/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Vellore/)).toBeNull(); // collapsed by default — list not rendered
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Vellore/)).toBeInTheDocument();
    fireEvent.click(toggle); // click again to collapse
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Vellore/)).toBeNull();
  });

  it('does not make the header a toggle when there are no postings', () => {
    setState({ data: [] });
    renderCard();
    expect(screen.queryByRole('button', { name: /i'm vacant/i })).toBeNull();
  });

  it('renders 2/2 with the Post button disabled + tooltip + "max reached" label', () => {
    setState({ data: [vacancy('v1'), vacancy('v2')] });
    renderCard();
    expect(screen.getByText(/2 \/ 2 active — max reached/)).toBeInTheDocument();
    // No link to /vacancies/new when at the limit
    expect(screen.queryByRole('link', { name: /post vacant/i })).toBeNull();
    const btn = screen.getByRole('button', { name: /post vacant \(disabled/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringContaining('Max 2 active vacancies'));
  });

  it('renders the loading placeholder while the query is pending', () => {
    setState({ isPending: true, data: undefined });
    renderCard();
    expect(screen.getByText(/— \/ 2 active/)).toBeInTheDocument();
  });

  it('respects the admin-configured max from app_settings (e.g. 5)', () => {
    setAppSettings(5);
    setState({ data: [vacancy('v1'), vacancy('v2'), vacancy('v3')] });
    renderCard();
    expect(screen.getByText(/3 \/ 5 active/)).toBeInTheDocument();
    // 3 < 5 → Post still enabled
    expect(screen.getByRole('link', { name: /post vacant/i })).toBeInTheDocument();
  });

  it('disables the Post button when count >= configured max (e.g. 1/1)', () => {
    setAppSettings(1);
    setState({ data: [vacancy('v1')] });
    renderCard();
    expect(screen.getByText(/1 \/ 1 active — max reached/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /post vacant \(disabled/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringContaining('Max 1 active vacancy'));
  });

  it('falls back to 2 when app_settings has not loaded yet', () => {
    setAppSettings(undefined);
    setState({ data: [vacancy('v1'), vacancy('v2')] });
    renderCard();
    expect(screen.getByText(/2 \/ 2 active — max reached/)).toBeInTheDocument();
  });
});
