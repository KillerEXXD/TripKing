import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';

vi.mock('@/components/bug/BugReportFAB', () => ({ BugReportFAB: () => <div data-testid="fab" /> }));

const driver: User = { id: 'd', role: 'driver', phone: '+91', displayName: 'Driver', preferredLanguage: 'en', isActive: true, canReportBugs: false };

function renderLayout() {
  vi.mocked(useAuth).mockReturnValue({ user: driver, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div data-testid="page">home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  it('renders the routed page, the bottom nav, and the bug-report FAB', () => {
    renderLayout();
    expect(screen.getByTestId('page')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByTestId('fab')).toBeInTheDocument();
  });

  it('uses a h-dvh flex column with `<main>` as the scroll container so the nav sits at the visible bottom via natural flow (not position: fixed)', () => {
    // Regression: the prior layout was `min-h-dvh` + `pb-[calc(7rem+safe-area)]`
    // + a position:fixed nav. That model anchored the nav to the LAYOUT
    // viewport, leaving 30-40px of gap or clipping on mobile. The fix is
    // a h-dvh flex column where <main> is `flex-1 overflow-y-auto` and the
    // nav is its sibling — dvh tracks the visual viewport so the nav always
    // lands at the visible bottom edge.
    renderLayout();
    const main = screen.getByRole('main');
    const shell = main.parentElement!;
    expect(shell.className).toMatch(/\bflex\b/);
    expect(shell.className).toMatch(/\bh-dvh\b/);
    expect(shell.className).toMatch(/\bflex-col\b/);
    expect(shell.className).not.toMatch(/min-h-dvh/);
    expect(shell.className).not.toMatch(/pb-\[/); // no nav-clearance padding on the container
    expect(main.className).toMatch(/\bflex-1\b/);
    expect(main.className).toMatch(/\boverflow-y-auto\b/);
  });
});
