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
    expect(back).toHaveAttribute('href', '/app/administration/designs');
  });

  it('chip rail wraps to multiple lines so no chip is clipped on narrow viewports', () => {
    // Regression: on iPhone 14 Pro Max (430px) the page-chip rail (9 items
    // + Back link) overflowed off-screen with `overflow-x-auto` and
    // horizontal scroll was unreliable on mobile. The rail must `flex-wrap`.
    renderAt('/v3/trips?nav=design');
    const rail = screen.getByRole('navigation', { name: /switch page within this design/i });
    expect(rail.className).toMatch(/\bflex-wrap\b/);
    expect(rail.className).not.toMatch(/\boverflow-x-auto\b/);
  });

  it('default (no nav param) renders all 6 version chips with the active one aria-current', () => {
    renderAt('/v4/profile');
    for (const label of ['v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}\\b`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /^v4\b/ })).toHaveAttribute('aria-current', 'page');
  });

  it('default: path-aware swap preserves the sub-route', () => {
    renderAt('/v2/trips/abc-123');
    expect(screen.getByRole('link', { name: /^v3\b/ })).toHaveAttribute('href', '/v3/trips/abc-123');
    expect(screen.getByRole('link', { name: /^v6\b/ })).toHaveAttribute('href', '/v6/trips/abc-123');
  });

  it('nav=pages: renders version chips and preserves ?nav=pages on each chip target', () => {
    renderAt('/v2/wallet?nav=pages');
    for (const label of ['v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}\\b`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /^v5\b/ })).toHaveAttribute('href', '/v5/wallet?nav=pages');
    expect(screen.getByRole('link', { name: /^v7\b/ })).toHaveAttribute('href', '/v7/wallet?nav=pages');
  });

  it('nav=design: renders PAGE chips (not version chips), preserves /vN prefix, carries ?nav=design', () => {
    renderAt('/v3/trips?nav=design');
    // Page chips present
    for (const label of ['Home', 'Trips', 'Profile', 'Wallet', 'Examples']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    // Version chips absent
    expect(screen.queryByRole('link', { name: /^v2\b/ })).not.toBeInTheDocument();
    // Tapping Wallet → /v3/wallet?nav=design (preserve /v3, swap sub-route)
    expect(screen.getByRole('link', { name: 'Wallet' })).toHaveAttribute('href', '/v3/wallet?nav=design');
    // Tapping Home → /v3?nav=design
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/v3?nav=design');
    // Active chip = Trips
    expect(screen.getByRole('link', { name: 'Trips' })).toHaveAttribute('aria-current', 'page');
  });

  it('nav=design: active page chip tracks the current sub-route even with a trip-id', () => {
    renderAt('/v4/trips/abc-123?nav=design');
    // Trip detail should mark "Trips" as active (the chip set doesn't include a separate Trip detail)
    expect(screen.getByRole('link', { name: 'Trips' })).toHaveAttribute('aria-current', 'page');
    // Trip-detail subpath specifically is NOT treated as "Post"
    expect(screen.getByRole('link', { name: 'Post' })).not.toHaveAttribute('aria-current');
  });
});
