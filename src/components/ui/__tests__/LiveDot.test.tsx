import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { LiveDot } from '@/components/ui/LiveDot';

describe('<LiveDot>', () => {
  it('renders the default "Live" label + the pulsing dot', () => {
    render(<LiveDot />);
    expect(screen.getByRole('status', { name: /live/i })).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('hides the label when label="" but keeps an aria-label', () => {
    render(<LiveDot label="" ariaLabel="Auto-refreshing" />);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Auto-refreshing' })).toBeInTheDocument();
  });

  it('amber tone changes the dot + text colour classes', () => {
    render(<LiveDot tone="amber" label="Awaiting" />);
    const label = screen.getByText('Awaiting');
    expect(label.className).toMatch(/text-amber-700/);
  });

  it('a11y: passes axe in the default form', async () => {
    const { container } = render(<LiveDot />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
