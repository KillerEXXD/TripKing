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
    renderNav('/trips');
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

  it('navigates when a tab is tapped', () => {
    setUser(driver);
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<><BottomNav /><div>home content</div></>} />
          <Route path="/trips" element={<div>trips content</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /find trips/i }));
    expect(screen.getByText('trips content')).toBeInTheDocument();
  });
});
