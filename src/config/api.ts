/**
 * API configuration.
 *
 * Primary data access goes through Supabase — see `lib/supabase.ts` and
 * `lib/api/services/*`. This config is for an optional edge-function / REST
 * layer added later (e.g. server-side logic like OTP issuance or push).
 */
export const API_CONFIG = {
  baseUrl:
    (import.meta.env.VITE_API_URL as string | undefined) ||
    `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1`,
  timeoutMs: 30_000,
} as const;
