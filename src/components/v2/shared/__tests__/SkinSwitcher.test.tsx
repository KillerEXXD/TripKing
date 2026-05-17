import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SkinSwitcher } from '@/components/v2/shared/SkinSwitcher';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SkinSwitcher />
    </MemoryRouter>,
  );
}

describe('SkinSwitcher', () => {
  it('renders a Back to Designs link pointing at /administration/designs', () => {
    renderAt('/v2/trips');
    const back = screen.getByRole('link', { name: /back to design previews/i });
    expect(back).toHaveAttribute('href', '/administration/designs');
  });

  it('renders all 5 skin chips with the active one aria-current', () => {
    renderAt('/v4/profile');
    for (const label of ['v2', 'v3', 'v4', 'v5', 'v6']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}\\b`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /^v4\b/ })).toHaveAttribute('aria-current', 'page');
  });

  it('path-aware swap: tapping another chip preserves the sub-route', () => {
    renderAt('/v2/trips/abc-123');
    expect(screen.getByRole('link', { name: /^v3\b/ })).toHaveAttribute('href', '/v3/trips/abc-123');
    expect(screen.getByRole('link', { name: /^v6\b/ })).toHaveAttribute('href', '/v6/trips/abc-123');
  });
});
