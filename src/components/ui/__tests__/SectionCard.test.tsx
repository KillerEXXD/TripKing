import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SectionCard } from '@/components/ui/SectionCard';

function withRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('SectionCard', () => {
  it('renders label, icon, and children', () => {
    withRouter(
      <SectionCard accent="green" label="Vacant" icon={<span data-testid="icon">i</span>}>
        12 drivers
      </SectionCard>,
    );
    expect(screen.getByText('Vacant')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('12 drivers')).toBeInTheDocument();
  });

  it('renders as a <Link> when `to` is supplied', () => {
    withRouter(<SectionCard accent="amber" label="X" to="/app/vacancies">body</SectionCard>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/app/vacancies');
  });

  it('renders as a role="button" when `onClick` is supplied; calls handler on click', () => {
    const onClick = vi.fn();
    withRouter(<SectionCard accent="blue" onClick={onClick}>body</SectionCard>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the accent border-left class for the selected tone', () => {
    withRouter(<SectionCard accent="purple" label="X">body</SectionCard>);
    // The outer element is the static <div> wrapping the body.
    const outer = screen.getByText('body').closest('div.rounded-card');
    expect(outer?.className).toMatch(/border-l-purple-accent/);
  });
});
