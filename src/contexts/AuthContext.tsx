import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import { getCurrentUser, logout as logoutService, requestOtp as requestOtpService, verifyOtp as verifyOtpService } from '@/lib/api/services/auth';
import { logger } from '@/lib/logger';
import { setSentryUser, clearSentryUser } from '@/lib/sentry';
import { identifyUser, resetUser } from '@/lib/posthog';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  /** True until the initial session-restore attempt completes. */
  isLoading: boolean;
  requestOtp: (phone: string) => Promise<void>;
  /** Verify an OTP, store the session, set `user`. */
  verifyOtp: (phone: string, otp: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Tell Sentry + PostHog who the user is (or that there is no user). */
function identifyObservability(user: User | null): void {
  if (user) {
    setSentryUser({ id: user.id, role: user.role, name: user.displayName });
    identifyUser(user.id, { role: user.role });
  } else {
    clearSentryUser();
    resetUser();
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // The API client tells us when a 401 + refresh failed (dead session).
    apiClient.onAuthFailure(() => {
      if (cancelled) return;
      setUser(null);
      identifyObservability(null);
    });

    void (async () => {
      if (!apiClient.getAccessToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await getCurrentUser();
        if (!cancelled) {
          setUser(me);
          identifyObservability(me);
        }
      } catch (error) {
        logger.debug('session restore failed:', error);
        apiClient.clearTokens();
        if (!cancelled) {
          setUser(null);
          identifyObservability(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      requestOtp: requestOtpService,
      verifyOtp: async (phone, otp) => {
        const u = await verifyOtpService(phone, otp);
        setUser(u);
        identifyObservability(u);
        return u;
      },
      logout: async () => {
        await logoutService();
        setUser(null);
        identifyObservability(null);
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
