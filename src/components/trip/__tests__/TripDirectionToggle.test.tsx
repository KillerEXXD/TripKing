import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TripDirectionToggle } from '@/components/trip/TripDirectionToggle';

describe('TripDirectionToggle', () => {
  it('marks the active direction selected with a prominent primary outline + check badge', () => {
    render(<TripDirectionToggle value="round_trip" onChange={() => {}} />);
    const oneWay = screen.getByRole('tab', { name: /one-way/i });
    const roundTrip = screen.getByRole('tab', { name: /round-trip/i });
    expect(oneWay).toHaveAttribute('aria-selected', 'false');
    expect(roundTrip).toHaveAttribute('aria-selected', 'true');
    // The active option reads clearly as "selected": primary tint + a check badge.
    expect(roundTrip.className).toMatch(/bg-primary\/10/);
    expect(oneWay.className).toMatch(/border-input/);
    expect(roundTrip.querySelector('svg')).not.toBeNull(); // check badge only on the active one
    expect(oneWay.querySelector('svg')).toBeNull();
  });

  it('emits the picked direction', () => {
    const onChange = vi.fn();
    render(<TripDirectionToggle value="one_way" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /round-trip/i }));
    expect(onChange).toHaveBeenCalledWith('round_trip');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<TripDirectionToggle value="one_way" onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
