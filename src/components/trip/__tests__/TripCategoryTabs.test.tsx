import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TripCategoryTabs } from '@/components/trip/TripCategoryTabs';

describe('TripCategoryTabs', () => {
  it('renders the three categories and marks the active one selected', () => {
    render(<TripCategoryTabs value="outstation" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /local/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /outstation/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /package/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('emits the picked category', () => {
    const onChange = vi.fn();
    render(<TripCategoryTabs value="outstation" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /package/i }));
    expect(onChange).toHaveBeenCalledWith('package');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<TripCategoryTabs value="local" onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
