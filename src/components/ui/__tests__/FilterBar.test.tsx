import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBar, FilterPill } from '@/components/ui/FilterBar';

describe('FilterPill', () => {
  it('reflects the active state via aria-pressed', () => {
    render(<FilterPill active={true} onClick={() => undefined}>All</FilterPill>);
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<FilterPill active={false} onClick={onClick}>Open</FilterPill>);
    fireEvent.click(screen.getByRole('button', { name: /Open/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a count bubble when count is supplied', () => {
    render(<FilterPill active={false} onClick={() => undefined} count={7}>X</FilterPill>);
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('renders as a horizontal toolbar with the supplied aria-label', () => {
    render(
      <FilterBar ariaLabel="Status filter">
        <FilterPill active={false} onClick={() => undefined}>A</FilterPill>
      </FilterBar>,
    );
    expect(screen.getByRole('toolbar', { name: 'Status filter' })).toBeInTheDocument();
  });
});
