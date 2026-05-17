/** Auth principal — a row in `public.users`. */
export type UserRole = 'driver' | 'trip_manager' | 'admin';

/**
 * Server-evaluated per-user feature flags returned by `/auth/me`. Keep keys lowercase_snake
 * to match the backend payload. Add a new flag here AND in `computeFeatureFlags()` in
 * `supabase/functions/auth/index.ts`.
 */
export interface FeatureFlags {
  /** True iff the user's phone is in `public.design_preview_allowlist` with `is_active`. */
  designPreviews: boolean;
}

export interface User {
  id: string;
  role: UserRole;
  /** E.164 phone — the login identity. */
  phone: string;
  email?: string;
  displayName: string;
  /** BCP-47 short code, FK → `languages.code` (e.g. `'en'`, `'ta'`, `'hi'`). */
  preferredLanguage: string;
  isActive: boolean;
  /** Per-user gate for `POST /bug-reports`. Admins are always allowed regardless. */
  canReportBugs: boolean;
  /**
   * Server-evaluated feature flags. The `/auth/me` transform always sets this; the
   * field is optional only so test fixtures don't have to bulk-update. In production
   * code, treat absent as "all flags false" (e.g. `user.featureFlags?.designPreviews === true`).
   */
  featureFlags?: FeatureFlags;
}

/** Token pair + user returned by `/auth/verify-otp`. */
export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}
