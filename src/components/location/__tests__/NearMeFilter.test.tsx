import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NearMeFilter } from '@/components/location/NearMeFilter';

vi.mock('@/hooks/useGeolocation', () => ({ useGeolocation: vi.fn() }));
import { useGeolocation } from '@/hooks/useGeolocation';

type GeoOver = { position?: { lat: number; lng: number } | null; loading?: boolean; error?: string | null };
function setGeo(over: GeoOver = {}) {
  const request = vi.fn();
  const clear = vi.fn();
  vi.mocked(useGeolocation).mockReturnValue({ position: null, loading: false, error: null, request, clear, ...over } as never);
  return { request, clear };
}

describe('NearMeFilter', () => {
  beforeEach(() => {
    vi.mocked(useGeolocation).mockReset();
    setGeo();
  });

  it('shows a "Near me" button when off; clicking it requests geolocation', () => {
    const { request } = setGeo();
    render(<NearMeFilter value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /near me/i }));
    expect(request).toHaveBeenCalled();
  });

  it('switches the filter on at the default radius once a position resolves', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NearMeFilter value={null} onChange={onChange} />);
    setGeo({ position: { lat: 12.97, lng: 79.13 } }); // the position arrives on the next render
    rerender(<NearMeFilter value={null} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith({ lat: 12.97, lng: 79.13, radiusKm: 25 });
  });

  it('shows the radius selector + a clear button when active; changing the radius re-emits', () => {
    const onChange = vi.fn();
    render(<NearMeFilter value={{ lat: 12.97, lng: 79.13, radiusKm: 25 }} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /near me/i })).toBeNull();
    fireEvent.change(screen.getByLabelText(/search radius/i), { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith({ lat: 12.97, lng: 79.13, radiusKm: 10 });
  });

  it('clearing turns the filter off and resets geolocation', () => {
    const onChange = vi.fn();
    const { clear } = setGeo();
    render(<NearMeFilter value={{ lat: 12.97, lng: 79.13, radiusKm: 25 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /turn off the near-me filter/i }));
    expect(clear).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('surfaces a geolocation error', () => {
    setGeo({ error: 'Location is off — turn it on to browse nearby.' });
    render(<NearMeFilter value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/location is off/i)).toBeInTheDocument();
  });
});
