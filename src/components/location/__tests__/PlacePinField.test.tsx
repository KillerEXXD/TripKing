import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlacePinField } from '@/components/location/PlacePinField';
import type { Place } from '@/types';

const fakePlace: Place = { id: 'p1', provider: 'nominatim', providerPlaceId: 'N1', name: 'Katpadi, Vellore', formattedAddress: null, state: 'TN', country: 'IN', lat: 12.97, lng: 79.13, cityId: null, isActive: true, createdAt: '2026-05-12T00:00:00Z' };
// Stub the search panel so this test doesn't pull in the React Query stack.
vi.mock('@/components/location/LocationSearchPanel', () => ({
  LocationSearchPanel: ({ onPick, onClose }: { onPick: (p: Place) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="search">
      <button type="button" onClick={() => onPick(fakePlace)}>
        mock-pick
      </button>
      <button type="button" onClick={onClose}>
        mock-close
      </button>
    </div>
  ),
}));

describe('PlacePinField', () => {
  it('shows the pin link when nothing is set; opening the panel and picking calls onChange', () => {
    const onChange = vi.fn();
    render(<PlacePinField value={null} onChange={onChange} pinLabel="Pin the exact spot" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /pin the exact spot/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mock-pick/i }));
    expect(onChange).toHaveBeenCalledWith(fakePlace);
  });

  it('shows a removable chip when a place is set; clicking it clears the value', () => {
    const onChange = vi.fn();
    render(<PlacePinField value={fakePlace} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /pin the exact spot/i })).toBeNull();
    const chip = screen.getByRole('button', { name: /remove the pinned location katpadi/i });
    expect(chip).toHaveTextContent('Katpadi, Vellore');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('closing the panel without picking leaves the value alone', () => {
    const onChange = vi.fn();
    render(<PlacePinField value={null} onChange={onChange} pinLabel="Pin a spot" />);
    fireEvent.click(screen.getByRole('button', { name: /pin a spot/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-close/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
