import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BottomNav } from '@/components/layout/BottomNav';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';

const driver: User = { id: 'd', role: 'driver', phone: '+91', displayName: 'Driver', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const agent: User = { ...driver, id: 'a', role: 'trip_manager', displayName: 'Agent' };

function setUser(user: User) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
function renderNav(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={<><BottomNav /><div data-testid="path-marker" /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('shows the driver tab set for a driver (no Profile tab — lives in top-right avatar)', () => {
    setUser(driver);
    renderNav();
    expect(screen.getByRole('button', { name: /^home$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find trips/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post a trip/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my trips/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^profile$/i })).toBeNull();
  });

  it('shows the agent tab set for an agent (no Browse / Profile tab)', () => {
    setUser(agent);
    renderNav();
    expect(screen.getByRole('button', { name: /^home$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post a trip/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my posts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find driver/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /find trips/i })).toBeNull();
  });

  it('marks the tab matching the current path as current', () => {
    setUser(driver);
    renderNav('/app/trips');
    expect(screen.getByRole('button', { name: /find trips/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /^home$/i })).not.toHaveAttribute('aria-current');
  });

  it('grows to fit its content via minHeight (not a fixed height) so labels are never clipped', () => {
    // Regression: prior versions used a fixed `height` that clipped the bottom
    // label row whenever the active-pill / icon / safe-area pushed past the cap.
    // The fix uses `min-height` so the nav grows to its content.
    setUser(driver);
    renderNav();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(nav.style.minHeight).toBeTruthy();
    expect(nav.style.minHeight).toMatch(/safe-area-inset-bottom/);
    expect(nav.style.height).toBe('');
  });

  it('is NOT position: fixed — sits in natural flow under AppLayout\'s flex column so dvh tracks the visual viewport (the permanent fix that replaced 5 visualViewport-tracking band-aids)', () => {
    // Regression: `position: fixed; bottom: 0` anchors to the LAYOUT viewport,
    // which mobile browsers inflate by their bottom chrome. That left the nav
    // 30-40px below the VISIBLE viewport edge, clipping labels and the FAB.
    // The previous attempt tracked window.visualViewport in a useEffect with
    // rAF + setTimeout + pathname-keyed re-measurement; none of it held in
    // every browser × keyboard × URL-bar combination. The fix is to drop
    // fixed positioning entirely and let AppLayout's h-dvh flex column place
    // the nav at the visible bottom edge via natural flow.
    setUser(driver);
    renderNav();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(nav.className).not.toMatch(/\bfixed\b/);
    expect(nav.className).not.toMatch(/\bbottom-0\b/);
    expect(nav.className).not.toMatch(/\binset-x-0\b/);
    // No JS-set inline bottom either — that was the visualViewport band-aid.
    expect(nav.style.bottom).toBe('');
    expect(nav.style.position).toBe('');
  });

  it('preserves the safe-area inset for the iOS home-indicator zone via padding-bottom', () => {
    // The container moved out of `position: fixed`, but the nav still needs
    // to clear the home-indicator zone on real iOS — that's why
    // padding-bottom keeps the `env(safe-area-inset-bottom)` term.
    setUser(driver);
    renderNav();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(nav.style.paddingBottom).toMatch(/safe-area-inset-bottom/);
  });

  it('navigates when a tab is tapped', () => {
    setUser(driver);
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<><BottomNav /><div>home content</div></>} />
          <Route path="/app/trips" element={<div>trips content</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /find trips/i }));
    expect(screen.getByText('trips content')).toBeInTheDocument();
  });
});
