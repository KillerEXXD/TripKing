import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';

type Tab = 'a' | 'b' | 'c';

describe('SegmentedTabs', () => {
  it('marks the currently-selected tab via aria-selected', () => {
    render(
      <SegmentedTabs<Tab>
        value="b"
        onChange={() => undefined}
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]}
      />,
    );
    expect(screen.getByRole('tab', { name: /^A/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /^B/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange with the typed value when a tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs<Tab>
        value="a"
        onChange={onChange}
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders count bubbles when supplied', () => {
    render(
      <SegmentedTabs<Tab>
        value="a"
        onChange={() => undefined}
        options={[{ value: 'a', label: 'A', count: 3 }, { value: 'b', label: 'B' }]}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
