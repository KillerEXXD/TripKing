import { type ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import { AdminRoute } from '../AdminRoute';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';

type AuthState = { user: User | null; isAuthenticated: boolean; isLoading: boolean };
function setAuth(state: AuthState) {
  vi.mocked(useAuth).mockReturnValue({
    ...state,
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    logout: vi.fn(),
  });
}
const admin: User = { id: 'a1', role: 'admin', phone: '+91', displayName: 'Admin', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const driver: User = { ...admin, id: 'd1', role: 'driver', displayName: 'Driver' };

function renderAt(path: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/app/signin" element={<div>signin page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('renders children when authenticated', () => {
    setAuth({ user: driver, isAuthenticated: true, isLoading: false });
    renderAt('/dash', <ProtectedRoute><div>secret</div></ProtectedRoute>);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('redirects to /app/signin when not authenticated', () => {
    setAuth({ user: null, isAuthenticated: false, isLoading: false });
    renderAt('/dash', <ProtectedRoute><div>secret</div></ProtectedRoute>);
    expect(screen.getByText('signin page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('shows a loading placeholder while the session restores', () => {
    setAuth({ user: null, isAuthenticated: false, isLoading: true });
    renderAt('/dash', <ProtectedRoute><div>secret</div></ProtectedRoute>);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });
});

describe('AdminRoute', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('renders children for an admin', () => {
    setAuth({ user: admin, isAuthenticated: true, isLoading: false });
    renderAt('/app/administration', <AdminRoute><div>admin area</div></AdminRoute>);
    expect(screen.getByText('admin area')).toBeInTheDocument();
  });

  it('403s a signed-in non-admin', () => {
    setAuth({ user: driver, isAuthenticated: true, isLoading: false });
    renderAt('/app/administration', <AdminRoute><div>admin area</div></AdminRoute>);
    expect(screen.getByText(/admins only/i)).toBeInTheDocument();
    expect(screen.queryByText('admin area')).toBeNull();
  });

  it('bounces an anonymous user to /app/signin', () => {
    setAuth({ user: null, isAuthenticated: false, isLoading: false });
    renderAt('/app/administration', <AdminRoute><div>admin area</div></AdminRoute>);
    expect(screen.getByText('signin page')).toBeInTheDocument();
  });
});
