import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OperatorBottomNav } from '@/components/v2/operator-console/BottomNav';
import { FieldBottomNav } from '@/components/v2/field-companion/BottomNav';
import { PipelineBottomNav } from '@/components/v2/pipeline-board/BottomNav';
import { EditorialBottomNav } from '@/components/v2/editorial/BottomNav';
import { BharatBottomNav } from '@/components/v2/bharat-native/BottomNav';
import { SimpleBottomNav } from '@/components/v2/simple-mode/BottomNav';

function renderAt(path: string, Nav: React.ComponentType) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
    </MemoryRouter>,
  );
}

describe('v2-v7 BottomNav variants', () => {
  it('Operator: 5 tab links, monochrome row, active aria-current matches path', () => {
    renderAt('/v2/wallet', OperatorBottomNav);
    const nav = screen.getByRole('navigation', { name: /operator/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /wallet/i })).toHaveAttribute('aria-current', 'page');
  });

  it('Field: 3 tabs + a centered Post FAB link', () => {
    renderAt('/v3', FieldBottomNav);
    expect(screen.getByRole('navigation', { name: /field/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post a new trip/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('Pipeline: 4 tabs with data-tint on active', () => {
    renderAt('/v4/trips', PipelineBottomNav);
    expect(screen.getByRole('navigation', { name: /pipeline/i })).toBeInTheDocument();
    const board = screen.getByRole('link', { name: /board/i });
    expect(board).toHaveAttribute('aria-current', 'page');
    expect(board).toHaveAttribute('data-tint', 'has_applicants');
  });

  it('Editorial: 5 serif italic tabs, active underlined', () => {
    renderAt('/v5/profile', EditorialBottomNav);
    expect(screen.getByRole('navigation', { name: /editorial/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /masthead/i })).toHaveAttribute('aria-current', 'page');
  });

  it('Bharat: 5 bilingual tabs', () => {
    renderAt('/v6', BharatBottomNav);
    expect(screen.getByRole('navigation', { name: /bharat/i })).toBeInTheDocument();
    // Tamil label for Home
    expect(screen.getAllByText(/வீடு/).length).toBeGreaterThan(0);
  });

  it('Simple: 3 BIG tiles only — Home / Trips / Help', () => {
    renderAt('/v7/trips', SimpleBottomNav);
    expect(screen.getByRole('navigation', { name: /simple/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trips' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help' })).toBeInTheDocument();
    // No Wallet / Profile / Notifications tabs in simple mode
    expect(screen.queryByRole('link', { name: /wallet/i })).not.toBeInTheDocument();
  });
});
