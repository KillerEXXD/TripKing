import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/layout/RoleSwitcher', () => ({ RoleSwitcher: () => <div data-testid="role-switcher" /> }));
vi.mock('@/pages/DriverHomePage', () => ({ default: () => <div data-testid="driver-home" /> }));
vi.mock('@/pages/AgentHomePage', () => ({ default: () => <div data-testid="agent-home" /> }));
vi.mock('@/pages/HomePage', () => ({ default: () => <div data-testid="admin-home" /> }));

vi.mock('@/stores/roleViewStore');
import { useEffectiveRole } from '@/stores/roleViewStore';
import { HomeForRole } from '@/pages/HomeForRole';

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeForRole />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('HomeForRole', () => {
  it('renders DriverHomePage when the effective role is driver', () => {
    vi.mocked(useEffectiveRole).mockReturnValue('driver');
    renderHome();
    expect(screen.getByTestId('role-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('driver-home')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-home')).not.toBeInTheDocument();
  });

  it('renders AgentHomePage when the effective role is trip_manager', () => {
    vi.mocked(useEffectiveRole).mockReturnValue('trip_manager');
    renderHome();
    expect(screen.getByTestId('agent-home')).toBeInTheDocument();
    expect(screen.queryByTestId('driver-home')).not.toBeInTheDocument();
  });

  it('renders the admin links hub (HomePage) for the admin role', () => {
    vi.mocked(useEffectiveRole).mockReturnValue('admin');
    renderHome();
    expect(screen.getByTestId('admin-home')).toBeInTheDocument();
    expect(screen.queryByTestId('driver-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-home')).not.toBeInTheDocument();
  });
});
