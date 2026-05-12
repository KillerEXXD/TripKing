/**
 * Standard `error.code` values returned across the API. Endpoints should use one
 * of these where it fits (the contract is documented in `public/docs/openapi.yaml`);
 * `fail()` still accepts other strings for endpoint-specific codes
 * (e.g. `INVALID_OTP`, `BAD_JSON`).
 */
export const ERROR_CODES = {
  VALIDATION: 'VALIDATION', // 400 / 422 — malformed or semantically invalid input
  UNAUTHORIZED: 'UNAUTHORIZED', // 401 — not signed in / bad or expired credentials
  FORBIDDEN: 'FORBIDDEN', // 403 — signed in, but not allowed to do this
  NOT_FOUND: 'NOT_FOUND', // 404 — no such resource
  CONFLICT: 'CONFLICT', // 409 — state / uniqueness conflict
  RATE_LIMITED: 'RATE_LIMITED', // 429 — too many requests
  DB_ERROR: 'DB_ERROR', // 4xx — an unmapped database error
  INTERNAL: 'INTERNAL', // 500 — unhandled exception (reported to Sentry, source=edge-fn)
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
