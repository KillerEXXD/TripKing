import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TripTypeTabs } from '@/components/trip/TripTypeTabs';
import type { TripType } from '@/types';

describe('TripTypeTabs', () => {
  it('renders all three tabs with one_way active by default and the hints visible', () => {
    render(<TripTypeTabs value="one_way" onChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
    // Hints surface the per-type explainer.
    expect(screen.getByText(/A → B drop/i)).toBeInTheDocument();
    expect(screen.getByText(/A → B → A/i)).toBeInTheDocument();
    expect(screen.getByText(/A → B → C → …/i)).toBeInTheDocument();
  });

  it('flips aria-selected when value changes', () => {
    const { rerender } = render(<TripTypeTabs value="one_way" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /one-way/i })).toHaveAttribute('aria-selected', 'true');
    rerender(<TripTypeTabs value="round_trip" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /round-trip/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /one-way/i })).toHaveAttribute('aria-selected', 'false');
    rerender(<TripTypeTabs value="multi_way" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /multi-way/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange with the right TripType when a tab is clicked', () => {
    const onChange = vi.fn();
    render(<TripTypeTabs value="one_way" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /round-trip/i }));
    expect(onChange).toHaveBeenLastCalledWith('round_trip' satisfies TripType);
    fireEvent.click(screen.getByRole('tab', { name: /multi-way/i }));
    expect(onChange).toHaveBeenLastCalledWith('multi_way' satisfies TripType);
    fireEvent.click(screen.getByRole('tab', { name: /one-way/i }));
    expect(onChange).toHaveBeenLastCalledWith('one_way' satisfies TripType);
  });

  it('has a tablist with the aria-label and accepts an optional className', () => {
    const { container } = render(<TripTypeTabs value="one_way" onChange={vi.fn()} className="extra-class" />);
    const tablist = screen.getByRole('tablist', { name: /trip type/i });
    expect(tablist).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('extra-class');
  });
});
