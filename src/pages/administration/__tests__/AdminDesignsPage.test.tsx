import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDesignsPage } from '@/pages/administration/AdminDesignsPage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('AdminDesignsPage', () => {
  it('lists all 5 prototype skins with their /vN entry routes', () => {
    render(<Wrap><AdminDesignsPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /design previews/i })).toBeInTheDocument();
    for (const name of ['Operator Console', 'Field Companion', 'Pipeline Board', 'Editorial', 'Bharat-Native']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    // Each direction has a primary "Open" link going to /vN root
    for (const path of ['/v2', '/v3', '/v4', '/v5', '/v6']) {
      const opens = screen.getAllByRole('link', { name: /open/i });
      expect(opens.some((a) => a.getAttribute('href') === path)).toBe(true);
    }
  });

  it('exposes per-skin sub-route links (profile / my-trips / notifications)', () => {
    render(<Wrap><AdminDesignsPage /></Wrap>);
    // Spot-check sub-routes for two skins
    expect(screen.getByRole('link', { name: /profile.*\/v3\/profile/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /notifications.*\/v6\/notifications/i })).toBeInTheDocument();
  });
});
