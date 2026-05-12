import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

/**
 * "View as" override for administrators.
 *
 * A regular user's `users.role` is fixed (driver or trip_manager). An admin,
 * though, oversees both flows — so this store holds a transient `viewRole` that
 * lets an admin render the app *as if* they were a driver or an agent (and flip
 * back to the admin home). It only takes effect for admins (see
 * `useEffectiveRole`); for everyone else it's ignored. Backed by sessionStorage,
 * so it resets when the tab closes / the installed PWA relaunches — the admin
 * always starts in the admin home.
 */
interface RoleViewStore {
  viewRole: UserRole | null;
  setViewRole: (role: UserRole | null) => void;
  reset: () => void;
}

export const useRoleViewStore = create<RoleViewStore>()(
  persist(
    (set) => ({
      viewRole: null,
      setViewRole: (role) => set({ viewRole: role }),
      reset: () => set({ viewRole: null }),
    }),
    {
      name: 'tripking:view-as',
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
    },
  ),
);

/** True if the signed-in user is allowed to switch which role they view the app as (admins only). */
export function useCanSwitchRole(): boolean {
  const { user } = useAuth();
  return user?.role === 'admin';
}

/**
 * The role the UI should render *right now*: the admin's `viewRole` override if
 * one is set (and the user is an admin), otherwise their real `users.role`.
 * Falls back to `'driver'` while the session is still restoring. Every surface
 * that branches on role — `HomeForRole`, `BottomNav`, the `RoleSwitcher` itself —
 * reads through this so a single switch flips them all together.
 */
export function useEffectiveRole(): UserRole {
  const { user } = useAuth();
  const viewRole = useRoleViewStore((s) => s.viewRole);
  if (user?.role === 'admin' && viewRole) return viewRole;
  return user?.role ?? 'driver';
}
