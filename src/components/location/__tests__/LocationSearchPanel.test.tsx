import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocationSearchPanel, type LocationSearchPanelProps } from '@/components/location/LocationSearchPanel';
import type { Place, PlaceSearchResult } from '@/types';

vi.mock('@/hooks/usePlaces', () => ({ usePlaceSearch: vi.fn(), useResolveSearchResult: vi.fn() }));
import { usePlaceSearch, useResolveSearchResult } from '@/hooks/usePlaces';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const hit = (name: string, lat: number, lng: number): PlaceSearchResult => ({ provider: 'nominatim', providerPlaceId: name, name, formattedAddress: `${name}, Tamil Nadu, India`, state: 'Tamil Nadu', lat, lng });
const placeFor = (r: PlaceSearchResult): Place => ({ id: `id-${r.name}`, provider: r.provider, providerPlaceId: r.providerPlaceId, name: r.name, formattedAddress: r.formattedAddress, state: r.state, country: 'IN', lat: r.lat, lng: r.lng, cityId: null, isActive: true, createdAt: '2026-05-12T00:00:00Z' });

type SearchState = { data?: PlaceSearchResult[]; isFetching?: boolean; isError?: boolean };
function setSearch(s: SearchState = {}) {
  vi.mocked(usePlaceSearch).mockReturnValue({ data: [], isFetching: false, isError: false, ...s } as never);
}
function setResolve(impl?: (vars: { result: PlaceSearchResult }, opts?: { onSuccess?: (p: Place) => void; onError?: () => void }) => void) {
  const mutate = vi.fn(impl ?? ((vars, opts) => opts?.onSuccess?.(placeFor(vars.result))));
  vi.mocked(useResolveSearchResult).mockReturnValue({ mutate, isPending: false, variables: undefined } as never);
  return mutate;
}

function renderPanel(props: Partial<LocationSearchPanelProps> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<LocationSearchPanel onPick={onPick} onClose={onClose} {...props} />);
  return { onPick, onClose };
}
const searchBox = () => screen.getByRole('searchbox', { name: /search a location/i });

describe('LocationSearchPanel', () => {
  beforeEach(() => {
    vi.mocked(usePlaceSearch).mockReset();
    vi.mocked(useResolveSearchResult).mockReset();
    setSearch();
    setResolve();
  });

  it('renders a dialog and prompts to type at least 2 characters before searching', () => {
    renderPanel();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
  });

  it('lists results once a query is entered; picking one find-or-creates it and fires onPick + onClose', () => {
    setSearch({ data: [hit('Vellore', 12.9165, 79.1325), hit('Chennai', 13.0827, 80.2707)] });
    const { onPick, onClose } = renderPanel();
    fireEvent.change(searchBox(), { target: { value: 'che' } });
    expect(screen.getByRole('button', { name: /vellore/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /chennai/i }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-Chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707 }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a "searching…" hint while fetching with no results yet', () => {
    setSearch({ isFetching: true });
    renderPanel();
    fireEvent.change(searchBox(), { target: { value: 'mad' } });
    expect(screen.getByText(/searching/i)).toBeInTheDocument();
  });

  it('shows an empty message when the geocoder returns nothing', () => {
    setSearch({ data: [] });
    renderPanel();
    fireEvent.change(searchBox(), { target: { value: 'zzzzz' } });
    expect(screen.getByText(/no places found/i)).toBeInTheDocument();
  });

  it('shows an error message when the search fails', () => {
    setSearch({ isError: true });
    renderPanel();
    fireEvent.change(searchBox(), { target: { value: 'che' } });
    expect(screen.getByText(/couldn't search/i)).toBeInTheDocument();
  });

  it('closes via the X button', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
