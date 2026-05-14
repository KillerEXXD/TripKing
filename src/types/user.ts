/** Auth principal — a row in `public.users`. */
export type UserRole = 'driver' | 'trip_manager' | 'admin';

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
}

/** Token pair + user returned by `/auth/verify-otp`. */
export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}
