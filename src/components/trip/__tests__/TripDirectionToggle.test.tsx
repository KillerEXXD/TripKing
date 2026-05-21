import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TripDirectionToggle } from '@/components/trip/TripDirectionToggle';

describe('TripDirectionToggle', () => {
  it('marks the active direction selected', () => {
    render(<TripDirectionToggle value="round_trip" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /one-way/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /round-trip/i })).toHaveAttribute('aria-selected', 'true');
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
