import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddressField } from '@/components/location/AddressField';
import type { Place } from '@/types';

const fakePlace: Place = { id: 'p1', provider: 'nominatim', providerPlaceId: 'N1', name: 'Katpadi, Vellore', formattedAddress: 'Katpadi Rd, Vellore', state: 'TN', country: 'IN', lat: 12.97, lng: 79.13, cityId: null, isActive: true, createdAt: '2026-05-12T00:00:00Z' };
// Stub the search panel so this test doesn't pull in the React Query stack.
vi.mock('@/components/location/LocationSearchPanel', () => ({
  LocationSearchPanel: ({ onPick, onClose }: { onPick: (p: Place) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="search">
      <button type="button" onClick={() => onPick(fakePlace)}>mock-pick</button>
      <button type="button" onClick={onClose}>mock-close</button>
    </div>
  ),
}));

describe('AddressField', () => {
  it('shows the search button when empty; picking an address calls onChange', () => {
    const onChange = vi.fn();
    render(<AddressField value={null} onChange={onChange} searchLabel="Search the pickup address" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /search the pickup address/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-pick/i }));
    expect(onChange).toHaveBeenCalledWith(fakePlace);
  });

  it('renders the chosen address with name + formatted address and a clear button', () => {
    const onChange = vi.fn();
    render(<AddressField value={fakePlace} onChange={onChange} />);
    expect(screen.getByText('Katpadi, Vellore')).toBeInTheDocument();
    expect(screen.getByText('Katpadi Rd, Vellore')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear katpadi/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('lets the user change an already-picked address', () => {
    const onChange = vi.fn();
    render(<AddressField value={fakePlace} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
