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

  it('offsets `bottom` by (innerHeight − visualViewport.height) so the nav lands at the visible edge, not the layout edge', async () => {
    // Regression: `position: fixed; bottom: 0` anchors to the LAYOUT viewport.
    // Mobile browsers (and Chrome DevTools simulators) inflate the layout
    // viewport by their bottom chrome, so `bottom: 0` puts the nav 30-40px
    // BELOW the visible area — measured live as navBottom=967 vs vvHeight=932.
    // The component now reads visualViewport and sets `bottom` dynamically.
    const originalVV = window.visualViewport;
    const originalInner = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 967, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { height: 932, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    setUser(driver);
    renderNav();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    // useEffect runs after paint; flush microtasks
    await Promise.resolve();
    expect(nav.style.bottom).toBe('35px');
    Object.defineProperty(window, 'innerHeight', { value: originalInner, configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: originalVV, configurable: true });
  });

  it('re-measures after first paint to catch visualViewport calibrating late (no resize event ever fires)', async () => {
    // Regression: on initial load Chrome reports vv.height === innerHeight
    // (i.e. no chrome overlay) until layout calibrates a frame or two later,
    // and crucially no resize event fires when it does. Without a scheduled
    // re-measure the nav sticks at bottom: 0 and labels get clipped.
    const originalVV = window.visualViewport;
    const originalInner = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 967, configurable: true });
    // Start uncalibrated (vv.height === innerHeight); flip to the real value
    // before the rAF callback fires so the second update() sees the change.
    const vvObj = { height: 967, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vvObj });
    setUser(driver);
    renderNav();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    await Promise.resolve();
    expect(nav.style.bottom).toBe('0px'); // first measurement: uncalibrated
    vvObj.height = 932; // late calibration happens silently
    await new Promise((r) => setTimeout(r, 150)); // rAF + setTimeout(100) both fire
    expect(nav.style.bottom).toBe('35px'); // second measurement caught it
    Object.defineProperty(window, 'innerHeight', { value: originalInner, configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: originalVV, configurable: true });
  });

  it('re-runs the viewport measurement on SPA navigation (BottomNav stays mounted across routes — stale bottom was leaving a gap below the nav)', async () => {
    // Regression: BottomNav lives in AppLayout outside <Outlet>, so navigating
    // doesn't unmount it. The mount-time bottom value (set from /trips' vv
    // state) persisted on /home, where vv had calibrated to a different
    // height — leaving a gap below the nav. Now the effect deps include
    // pathname so the cascade re-fires on every route change.
    const originalVV = window.visualViewport;
    const originalInner = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 967, configurable: true });
    const vvObj = { height: 932, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vvObj });
    setUser(driver);
    const { rerender } = render(
      <MemoryRouter initialEntries={['/trips']}>
        <Routes>
          <Route path="*" element={<BottomNav />} />
        </Routes>
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: /primary/i });
    await Promise.resolve();
    expect(nav.style.bottom).toBe('35px'); // /trips measurement
    // simulate the visual viewport recalibrating between routes (no event fires)
    vvObj.height = 967;
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<BottomNav />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 150));
    expect(nav.style.bottom).toBe('0px'); // re-measured on / with new vv
    Object.defineProperty(window, 'innerHeight', { value: originalInner, configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: originalVV, configurable: true });
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
