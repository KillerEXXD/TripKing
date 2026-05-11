import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { User } from '@/types';
import { useAuthStore, type RegisteredAccount } from '@/stores/useAuthStore';

/**
 * Auth is phone-registration based (see `useAuthStore` / `AuthPage`). There
 * is exactly one account per device and it has every capability, so the
 * demo can walk through driver, trip-manager and admin flows from a single
 * login. We project that account onto the `User` shape the rest of the app
 * already consumes:
 *  - `id` is pinned to the seed driver `u-driver-1`, so the existing
 *    `mockDrivers.find(d => d.userId === user.id)` lookups light up the
 *    driver-side state (current city, assigned trips, …).
 *  - `role` is `admin` — the most-capable role — so anything gated on
 *    `user.role === 'admin'` (e.g. the rich `/drivers/:id` view) shows.
 */
const SELF_USER_ID = 'u-driver-1';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toUser(account: RegisteredAccount | null): User | null {
  if (!account) return null;
  const displayName = `${account.firstName} ${account.lastName}`.trim();
  return {
    id: SELF_USER_ID,
    role: 'admin',
    phone: `${account.countryCode}${account.phone}`,
    displayName: displayName || 'You',
    isActive: true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const account = useAuthStore((s) => s.account);
  const storeLogout = useAuthStore((s) => s.logout);

  const user = useMemo(() => toUser(account), [account]);
  const logout = useCallback(() => storeLogout(), [storeLogout]);

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, logout }),
    [user, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
