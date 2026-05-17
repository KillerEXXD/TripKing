import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionLabel } from '@/components/ui/SectionLabel';

describe('SectionLabel', () => {
  it('default accent — keeps the legacy uppercase + tracking classes (no icon)', () => {
    const { container } = render(<SectionLabel>Payout</SectionLabel>);
    expect(screen.getByText('Payout')).toBeInTheDocument();
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/uppercase/);
    expect(root.className).toMatch(/tracking-wider/);
    expect(root.className).toMatch(/text-muted-foreground/);
    // no icon slot rendered when icon prop is omitted
    expect(root.querySelector('span > svg')).toBeNull();
  });

  it('green accent — switches to emerald-700 heading and drops uppercase', () => {
    const { container } = render(<SectionLabel accent="green">Route & Schedule</SectionLabel>);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/text-emerald-700/);
    expect(root.className).not.toMatch(/uppercase/);
  });

  it('renders the optional icon when provided', () => {
    const { container } = render(
      <SectionLabel accent="green" icon={<svg data-testid="icon" />}>Vehicle Requirements</SectionLabel>,
    );
    expect(screen.getByText('Vehicle Requirements')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});
