import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * The phone-registered account for this device.
 *
 * In production this is the row in the `users` table created after the
 * phone-OTP flow. For the prototype it's a single localStorage record —
 * one device, one account — and that account has *all* capabilities
 * (driver + trip manager + admin) so the demo can exercise every flow
 * without juggling logins. See `AuthContext` for how this maps onto the
 * `User` shape the rest of the app expects.
 */
export interface RegisteredAccount {
  /** Dial code, e.g. "+91". */
  countryCode: string;
  /** National number, digits only, e.g. "9876543210". */
  phone: string;
  firstName: string;
  lastName: string;
  registeredAt: string;
  /** Set once the user has seen the "how it works" intro. */
  onboardedAt?: string;
}

interface AuthStore {
  account: RegisteredAccount | null;
  /** Persist a freshly-registered account (stamps `registeredAt`). */
  register: (a: Omit<RegisteredAccount, 'registeredAt' | 'onboardedAt'>) => void;
  /** Mark the "how it works" intro as seen. */
  markOnboarded: () => void;
  /** Clear the account — sends the user back to the splash/registration. */
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      account: null,
      register: (a) =>
        set({ account: { ...a, registeredAt: new Date().toISOString() } }),
      markOnboarded: () => {
        const acc = get().account;
        if (acc && !acc.onboardedAt) {
          set({ account: { ...acc, onboardedAt: new Date().toISOString() } });
        }
      },
      logout: () => set({ account: null }),
    }),
    {
      name: 'drivermahal:account',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
