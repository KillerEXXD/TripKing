import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import { getCurrentUser, logout as logoutService, requestOtp as requestOtpService, verifyOtp as verifyOtpService } from '@/lib/api/services/auth';
import { logger } from '@/lib/logger';
import { queryClient } from '@/lib/queryClient';
import { setRealtimeAuth, disconnectRealtime } from '@/lib/realtime';
import { setSentryUser, clearSentryUser } from '@/lib/sentry';
import { identifyUser, resetUser } from '@/lib/posthog';
import type { User } from '@/types';

/**
 * Persisted-Zustand keys that belong to the signed-in user. These must be
 * wiped on logout / user-switch — otherwise QA reports show the previous
 * user's applications / role-view state after signing in with a different
 * phone number.
 */
const PER_USER_STORAGE_KEYS = ['tripking:my-applications', 'tripking:view-as'];

/**
 * Drop every trace of the previous session that lives in the browser:
 * - the React Query cache (driver/me, agent/me, wallet, referrals, …),
 * - persisted Zustand stores keyed to that user.
 *
 * Called on logout and on a fresh verifyOtp — the auth token is the only
 * server-side identity we keep; everything else must be flushed.
 */
function clearLocalUserState(): void {
  queryClient.clear();
  for (const key of PER_USER_STORAGE_KEYS) {
    try { localStorage.removeItem(key); } catch { /* private-mode etc. */ }
  }
}

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
  /** Last user.id we surfaced — lets verifyOtp detect a user-switch and flush. */
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Keep the Realtime socket's JWT in lock-step with the REST token — fires on
    // login, on every single-flight refresh, and on logout (null clears it).
    apiClient.onTokenChange(setRealtimeAuth);
    // The API client tells us when a 401 + refresh failed (dead session).
    apiClient.onAuthFailure(() => {
      if (cancelled) return;
      clearLocalUserState();
      disconnectRealtime();
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
          // Session restored from a stored token — setTokens didn't run, so push
          // the existing JWT to Realtime explicitly.
          setRealtimeAuth(apiClient.getAccessToken());
          lastUserIdRef.current = me.id;
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
        // Always flush the previous user's cached/persisted state before
        // surfacing the new user — protects against "logged in as a different
        // phone, still see the old account's data" (e.g. /me cached by
        // queryKey, persisted Zustand stores).
        if (lastUserIdRef.current !== u.id) clearLocalUserState();
        lastUserIdRef.current = u.id;
        setUser(u);
        identifyObservability(u);
        return u;
      },
      logout: async () => {
        try { await logoutService(); } catch { /* network errors must not strand us */ }
        clearLocalUserState();
        disconnectRealtime();
        lastUserIdRef.current = null;
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
