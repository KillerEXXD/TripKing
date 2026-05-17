import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDesignsPage } from '@/pages/administration/AdminDesignsPage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('AdminDesignsPage', () => {
  it('renders the heading + Pages/Design tab strip with Design selected by default', () => {
    render(<Wrap><AdminDesignsPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /design previews/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /pages/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /design/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /design/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('Design tab: lists all 6 prototype skins with Open buttons that carry ?nav=design', () => {
    render(<Wrap><AdminDesignsPage /></Wrap>);
    for (const name of ['Operator Console', 'Field Companion', 'Pipeline Board', 'Editorial', 'Bharat-Native', 'Simple Mode']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    for (const path of ['/v2', '/v3', '/v4', '/v5', '/v6', '/v7']) {
      const opens = screen.getAllByRole('link', { name: /open/i });
      expect(opens.some((a) => a.getAttribute('href') === `${path}?nav=design`)).toBe(true);
    }
  });

  it('Design tab: every sub-route link carries ?nav=design', () => {
    render(<Wrap><AdminDesignsPage /></Wrap>);
    // Spot-check across designs and pages
    const expected = [
      ['/v3/profile', /profile/i],
      ['/v6/notifications', /notifications/i],
      ['/v7/wallet', /wallet/i],
    ] as const;
    for (const [path, name] of expected) {
      const matches = screen.getAllByRole('link', { name }).filter((a) => a.getAttribute('href') === `${path}?nav=design`);
      expect(matches.length, `expected at least one link to ${path}?nav=design`).toBeGreaterThan(0);
    }
  });

  it('Pages tab: lists 9 page rows, all defaulting to /v2 with ?nav=pages', () => {
    render(<Wrap><AdminDesignsPage /></Wrap>);
    fireEvent.click(screen.getByRole('tab', { name: /pages/i }));
    // 9 SKIN_PAGES entries — assert the most distinct ones are present
    const expected = [
      ['/v2?nav=pages', /home \(dashboard\)/i],
      ['/v2/trips?nav=pages', /trips list/i],
      ['/v2/trips/new?nav=pages', /post trip/i],
      ['/v2/profile?nav=pages', /^profile/i],
      ['/v2/wallet?nav=pages', /^wallet/i],
      ['/v2/scenarios?nav=pages', /live tracking/i],
    ] as const;
    for (const [href, name] of expected) {
      const matches = screen.getAllByRole('link', { name }).filter((a) => a.getAttribute('href') === href);
      expect(matches.length, `expected ${href}`).toBeGreaterThan(0);
    }
  });
});
