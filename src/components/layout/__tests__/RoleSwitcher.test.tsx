import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { useEffectiveRole, useRoleViewStore } from '@/stores/roleViewStore';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';

const driver: User = { id: 'd', role: 'driver', phone: '+91', displayName: 'Driver', preferredLanguage: 'en', isActive: true };
const admin: User = { ...driver, id: 'x', role: 'admin', displayName: 'Admin' };

function setUser(user: User | null) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: !!user, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}

describe('RoleSwitcher / useEffectiveRole', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    useRoleViewStore.getState().reset();
  });

  it('renders nothing for a non-admin', () => {
    setUser(driver);
    const { container } = render(<RoleSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Admin · Driver · Agent for an admin, with Admin selected by default', () => {
    setUser(admin);
    render(<RoleSwitcher />);
    expect(screen.getByRole('tab', { name: /admin/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /driver/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /agent/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('switching to Driver updates the selected tab and the effective role', () => {
    setUser(admin);
    render(<RoleSwitcher />);
    fireEvent.click(screen.getByRole('tab', { name: /driver/i }));
    expect(screen.getByRole('tab', { name: /driver/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /admin/i })).toHaveAttribute('aria-selected', 'false');
    expect(useRoleViewStore.getState().viewRole).toBe('driver');
  });

  it('useEffectiveRole: an admin sees their viewRole override; a non-admin always sees their real role', () => {
    setUser(admin);
    useRoleViewStore.getState().setViewRole('trip_manager');
    expect(renderHook(() => useEffectiveRole()).result.current).toBe('trip_manager');

    setUser(driver); // a non-admin: the override is ignored
    expect(renderHook(() => useEffectiveRole()).result.current).toBe('driver');
  });
});
