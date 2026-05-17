/**
 * The TripKing REST API client — a single `ApiClient` singleton.
 *
 * Ported from hudr-pwa/src/lib/api/client.ts and adapted to this API's
 * contract (see CLAUDE.md §"API"):
 *  - public/browse endpoints  →  `X-API-Key: <VITE_TRIPKING_API_KEY>`
 *  - authenticated endpoints  →  `Authorization: Bearer <accessToken>`
 *  - `{ success, data, meta?, error: { code, message } | null }` envelope
 *  - single-flight 401 → `POST /auth/refresh` → retry once; refresh fail →
 *    clear tokens + notify `onAuthFailure` (AuthContext bounces to /signin)
 *  - idempotent GETs retried on network errors / 5xx
 *  - failures → `ApiError`; unexpected ones (not 401/404) → Sentry; slow
 *    responses (>2s) and errors → PostHog
 *
 * Nothing here touches Supabase directly. No business logic.
 */

import { API_CONFIG } from '@/config/api';
import { addDataBreadcrumb, captureDataError } from '@/lib/sentry';
import { captureEvent } from '@/lib/posthog';
import type { ApiErrorBody, ApiResponse } from '@/types';

const API_KEY = import.meta.env.VITE_TRIPKING_API_KEY ?? '';

const ACCESS_TOKEN_KEY = 'tk_access_token';
const REFRESH_TOKEN_KEY = 'tk_refresh_token';

/** Endpoints that must NOT receive auth headers (they mint or refresh the session). */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/request-otp', '/auth/verify-otp', '/auth/refresh', '/auth/register'];

/** Error thrown for any non-2xx response (or network/timeout). `status === 0` = network error, `408` = timeout. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thrown when a 2xx response that should carry a body has `data: null` — i.e.
 * the API contract was violated. Distinct from `ApiError` (it's a server bug,
 * not an HTTP error); `classifyError` treats it like a transform error.
 */
export class EmptyResponseError extends Error {
  constructor(public resource: string) {
    super(`${resource}: API returned an empty response body`);
    this.name = 'EmptyResponseError';
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function isAuthEndpoint(endpoint: string): boolean {
  return AUTH_ENDPOINTS.some((p) => endpoint.startsWith(p));
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, String(v));
    } else {
      sp.append(key, String(value));
    }
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/** Coarse feature tag for observability, derived from the endpoint path. */
function featureFor(endpoint: string): string {
  if (endpoint.startsWith('/admin/')) return 'admin';
  if (endpoint.startsWith('/auth')) return 'auth';
  if (endpoint.startsWith('/trip-acceptances') || endpoint.includes('/applicants')) return 'acceptances';
  if (endpoint.startsWith('/trips')) return 'trips';
  if (endpoint.startsWith('/vacancies')) return 'vacancies';
  if (endpoint.startsWith('/places')) return 'places';
  if (endpoint.startsWith('/drivers')) return 'drivers';
  if (endpoint.startsWith('/trip-managers') || endpoint.startsWith('/agents')) return 'agents';
  if (endpoint.startsWith('/vehicles')) return 'vehicles';
  if (endpoint.startsWith('/alerts')) return 'alerts';
  if (endpoint.startsWith('/reviews')) return 'reviews';
  if (endpoint.startsWith('/notifications')) return 'notifications';
  if (endpoint.startsWith('/me') || endpoint.startsWith('/profile')) return 'user';
  return 'api';
}

function extractError(body: unknown): { message: string; code?: string } {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const err = obj.error;
    if (typeof err === 'string') return { message: err };
    if (err && typeof err === 'object') {
      const e = err as Partial<ApiErrorBody>;
      if (typeof e.message === 'string') return { message: e.message, code: e.code };
    }
    if (typeof obj.message === 'string') return { message: obj.message };
  }
  return { message: 'Request failed' };
}

class ApiClient {
  private readonly baseUrl = API_CONFIG.BASE_URL;
  private readonly timeout = API_CONFIG.TIMEOUT;
  private readonly maxRetries = API_CONFIG.RETRY_ATTEMPTS;
  /**
   * Phase-5 single-flight for GETs — extends the same mutex pattern the auth refresh uses
   * (line ~164) to *every* identical concurrent GET. React Query already dedupes its own
   * queries, but this layer covers non-RQ callers (manual `apiClient.get(...)` calls in the
   * passenger page, background pings, etc.). Cleared as soon as the underlying request settles.
   */
  private readonly inflightGets = new Map<string, Promise<unknown>>();

  /** Mutex — only one refresh in flight; concurrent 401s share the same promise. */
  private refreshPromise: Promise<boolean> | null = null;
  /** Set by AuthContext — invoked when refresh fails irrecoverably. */
  private authFailureHandler: (() => void) | null = null;

  onAuthFailure(handler: () => void): void {
    this.authFailureHandler = handler;
  }

  // ── token storage ─────────────────────────────────────────────────────────
  getAccessToken(): string | null {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(ACCESS_TOKEN_KEY);
  }
  getRefreshToken(): string | null {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  setTokens(accessToken: string | null, refreshToken?: string | null): void {
    if (typeof window === 'undefined') return;
    if (accessToken) window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    if (refreshToken !== undefined) {
      if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      else window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }
  clearTokens(): void {
    this.setTokens(null, null);
  }

  // ── token expiry (decode-only, no verification) ───────────────────────────
  private decodeExp(token: string): number | null {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
      return null;
    }
  }
  private accessTokenExpiringSoon(thresholdSeconds = 60): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    const exp = this.decodeExp(token);
    if (exp == null) return false;
    return exp - Math.floor(Date.now() / 1000) < thresholdSeconds;
  }

  // ── refresh (single-flight) ───────────────────────────────────────────────
  async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) return false;
        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) {
          // Refresh-token rejected (typically 401). Clear tokens immediately so the next
          // request — which is usually a 401 + reactive-refresh from `request()` — sees an
          // empty refresh token and short-circuits instead of firing a second doomed POST.
          this.clearTokens();
          return false;
        }
        const json = (await res.json()) as ApiResponse<{ access_token?: string; refresh_token?: string }>;
        const token = json.data?.access_token;
        if (json.success && token) {
          this.setTokens(token, json.data?.refresh_token ?? undefined);
          return true;
        }
        // 200 response but envelope said `success:false` or no token — treat same as a 401.
        this.clearTokens();
        return false;
      } catch {
        // Network error during refresh — don't clear tokens (they may still be valid; the
        // user is just offline). The reactive 401 path will retry on the next attempt.
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  // ── core request ──────────────────────────────────────────────────────────
  private async request<T>(
    endpoint: string,
    init: RequestInit & { method?: HttpMethod } = {},
    state: { didRefreshRetry?: boolean; attempt?: number } = {},
  ): Promise<ApiResponse<T>> {
    const method: HttpMethod = init.method ?? 'GET';
    const url = `${this.baseUrl}${endpoint}`;
    const authEndpoint = isAuthEndpoint(endpoint);
    const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const attempt = state.attempt ?? 0;

    // Proactive refresh — avoid a guaranteed 401 round-trip.
    if (!authEndpoint && !state.didRefreshRetry && this.getAccessToken() && this.accessTokenExpiringSoon()) {
      await this.refreshSession();
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (init.headers) new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    if (!authEndpoint) {
      const token = this.getAccessToken();
      // X-API-Key is the anonymous-read credential. Once a Bearer is present we send Bearer
      // alone — sending the key alongside is meaningless (the Bearer wins) and only leaks
      // the key into edge-fn/CDN access logs.
      if (API_KEY && !token) headers['X-API-Key'] = API_KEY;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, { ...init, method, headers, signal: controller.signal });
    } catch (error) {
      clearTimeout(timeoutId);
      const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      // Retry idempotent GETs on transport failure.
      if (method === 'GET' && attempt < this.maxRetries - 1) {
        await delay(backoffMs(attempt));
        return this.request<T>(endpoint, init, { ...state, attempt: attempt + 1 });
      }
      const apiError = new ApiError(isTimeout ? 'Request timeout' : (error as Error).message || 'Network error', isTimeout ? 408 : 0);
      addDataBreadcrumb('request failed', { feature: `api:${featureFor(endpoint)}`, endpoint, method, durationMs, retryAttempt: attempt }, 'error');
      this.reportError(apiError, endpoint, method, durationMs, undefined, attempt);
      throw apiError;
    }
    clearTimeout(timeoutId);

    const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
    const body = await safeJson(response);
    addDataBreadcrumb('request', { feature: `api:${featureFor(endpoint)}`, endpoint, method, status: response.status, durationMs }, response.ok ? 'info' : 'warning');

    if (response.ok) {
      if (durationMs > 2000) {
        captureEvent('api_slow_response', { endpoint, method, status: response.status, duration_ms: durationMs });
      }
      return (body ?? { success: true, data: null, error: null }) as ApiResponse<T>;
    }

    // 401 → refresh once → retry; on failure, dead session.
    if (response.status === 401 && !authEndpoint && !state.didRefreshRetry) {
      const refreshed = await this.refreshSession();
      if (refreshed) return this.request<T>(endpoint, init, { ...state, didRefreshRetry: true });
      this.clearTokens();
      this.authFailureHandler?.();
    }

    // Retry idempotent GETs on 5xx.
    if (method === 'GET' && response.status >= 500 && attempt < this.maxRetries - 1) {
      await delay(backoffMs(attempt));
      return this.request<T>(endpoint, init, { ...state, attempt: attempt + 1 });
    }

    const { message, code } = extractError(body);
    const apiError = new ApiError(message, response.status, code, body);
    // 401 (bad creds / expired), 404 (stale link) and 409 (semantic conflict —
    // e.g. "you already have a video call scheduled" / "vacancy limit reached" /
    // "already applied") are user-correctable, not bugs.
    // 401 / 403 / 404 / 409 / 422 / 429 are user-or-permission errors, not bugs —
    // skip both Sentry and the PostHog api_error event to keep telemetry signal-to-noise
    // high. (Kept in sync with the React-Query funnel filter in src/lib/queryClient.ts.)
    const isUserError = response.status === 401 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 422 || response.status === 429;
    if (!isUserError) {
      this.reportError(apiError, endpoint, method, durationMs, body, attempt);
      captureEvent('api_error', { endpoint, method, status: response.status, duration_ms: durationMs, message: message.slice(0, 200) });
    }
    throw apiError;
  }

  private reportError(error: ApiError, endpoint: string, method: HttpMethod, durationMs: number, body?: unknown, retryAttempt?: number): void {
    captureDataError(`api:${featureFor(endpoint)}`, error, {
      endpoint,
      method,
      status: error.status,
      durationMs,
      retryAttempt,
      body: body ? JSON.stringify(body).slice(0, 500) : undefined,
    });
  }

  // ── verb helpers ──────────────────────────────────────────────────────────
  get<T>(endpoint: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const url = `${endpoint}${buildQuery(params)}`;
    // Dedup key includes the access-token prefix so two different signed-in users hitting
    // the same endpoint concurrently DON'T share an in-flight promise (different tokens →
    // different Authorization headers → different upstream responses for the /me family
    // and any authed route). Anonymous callers share an empty `tok` so they DO dedupe.
    const tok = this.getAccessToken();
    const tokKey = tok ? tok.slice(-12) : '';
    const key = `GET ${url} ${tokKey}`;
    const existing = this.inflightGets.get(key) as Promise<ApiResponse<T>> | undefined;
    if (existing) return existing;
    const promise = this.request<T>(url, { method: 'GET' }).finally(() => {
      this.inflightGets.delete(key);
    });
    this.inflightGets.set(key, promise as Promise<unknown>);
    return promise;
  }
  post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  }
  put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
  }
  patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
  }
  delete<T>(endpoint: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request<T>(`${endpoint}${buildQuery(params)}`, { method: 'DELETE' });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function backoffMs(attempt: number): number {
  return Math.min(2000, 250 * 2 ** attempt);
}
async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { success: response.ok, data: null, error: { code: 'BAD_JSON', message: text.slice(0, 200) } };
  }
}

/** The singleton — import this everywhere; never `new ApiClient()`. */
export const apiClient = new ApiClient();
