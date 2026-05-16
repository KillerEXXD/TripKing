import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { HomeTile } from '../HomeTile';

function wrap(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe('HomeTile', () => {
  it('renders a link with the right href + label + optional sub', () => {
    render(wrap(<HomeTile to="/x" icon={TrendingUp} label="Earnings" sub="₹2,450 lifetime" />));
    const link = screen.getByRole('link', { name: 'Earnings' });
    expect(link).toHaveAttribute('href', '/x');
    expect(screen.getByText('Earnings')).toBeInTheDocument();
    expect(screen.getByText('₹2,450 lifetime')).toBeInTheDocument();
  });

  it('honours aria-label override', () => {
    render(wrap(<HomeTile to="/r" icon={TrendingUp} label="Refer" ariaLabel="View referrals" />));
    expect(screen.getByRole('link', { name: 'View referrals' })).toBeInTheDocument();
  });

  it('icon container has the expected tone classes', () => {
    const { container } = render(wrap(<HomeTile to="/x" icon={TrendingUp} label="Earnings" tone="emerald" />));
    const iconWrap = container.querySelector('.bg-emerald-100');
    expect(iconWrap).not.toBeNull();
  });
});
