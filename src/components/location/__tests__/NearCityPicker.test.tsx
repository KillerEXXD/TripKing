import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NearCityPicker } from '@/components/location/NearCityPicker';
import type { CityRow } from '@/types';

vi.mock('@/hooks/useGeolocation', () => ({ useGeolocation: vi.fn() }));
import { useGeolocation } from '@/hooks/useGeolocation';

const cities: CityRow[] = [
  { id: 'c1', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sortOrder: 1, isActive: true },
  { id: 'c2', name: 'Chennai', state: 'TN', lat: 13.08, lng: 80.27, sortOrder: 2, isActive: true },
  { id: 'c3', name: 'Bangalore', state: 'KA', lat: 12.97, lng: 77.59, sortOrder: 3, isActive: true },
];

function setGeo(over: Partial<ReturnType<typeof useGeolocation>> = {}) {
  vi.mocked(useGeolocation).mockReturnValue({
    position: null,
    loading: false,
    error: null,
    request: vi.fn(),
    clear: vi.fn(),
    ...over,
  });
}

describe('NearCityPicker', () => {
  beforeEach(() => {
    vi.mocked(useGeolocation).mockReset();
    setGeo();
  });

  it('renders "Near you" when nothing is selected and opens the menu on click', () => {
    const onChange = vi.fn();
    render(<NearCityPicker cities={cities} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /change the area to browse near/i }));
    expect(screen.getByRole('button', { name: /anywhere/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^vellore$/i })).toBeInTheDocument();
  });

  it('shows the currently selected city name on the pill', () => {
    render(<NearCityPicker cities={cities} value="c2" onChange={vi.fn()} />);
    expect(screen.getByText(/near chennai/i)).toBeInTheDocument();
  });

  it('picking a city fires onChange and closes the menu', () => {
    const onChange = vi.fn();
    render(<NearCityPicker cities={cities} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /change the area to browse near/i }));
    fireEvent.click(screen.getByRole('button', { name: /^bangalore$/i }));
    expect(onChange).toHaveBeenCalledWith('c3');
  });

  it('picking "Anywhere" clears the value', () => {
    const onChange = vi.fn();
    render(<NearCityPicker cities={cities} value="c1" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /change the area to browse near/i }));
    fireEvent.click(screen.getByRole('button', { name: /anywhere/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('"Use my current location" calls request() and shows the spinner while loading', () => {
    const request = vi.fn();
    setGeo({ request, loading: true });
    render(<NearCityPicker cities={cities} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /change the area to browse near/i }));
    const locating = screen.getByRole('button', { name: /locating/i });
    expect(locating).toBeDisabled();
  });

  it('renders the geolocation error message when present', () => {
    setGeo({ error: 'Location permission denied' });
    render(<NearCityPicker cities={cities} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /change the area to browse near/i }));
    expect(screen.getByText(/location permission denied/i)).toBeInTheDocument();
  });

  it('snaps to the nearest city when a fresh position arrives', async () => {
    const onChange = vi.fn();
    setGeo({ position: { lat: 12.95, lng: 77.6 } }); // very close to Bangalore
    render(<NearCityPicker cities={cities} value="" onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('c3'));
  });

  it('does not call onChange again when the nearest city is already selected', () => {
    const onChange = vi.fn();
    setGeo({ position: { lat: 13.08, lng: 80.27 } }); // dead-on Chennai
    render(<NearCityPicker cities={cities} value="c2" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
