/**
 * API base-URL resolution.
 *
 * - `VITE_USE_MOCK_API=true` → a local mock server (early dev).
 * - dev → `/api` (proxied to the real host by `vite.config.ts`, CORS-free).
 * - prod → `VITE_API_BASE_URL` (trailing slash stripped), falling back to the
 *   project's Supabase Edge Functions host when the env var isn't set in the
 *   deployment (so a Vercel build without env config still reaches the API).
 *
 * Mirrors hudr-pwa/src/config/api.ts.
 */
import { API_RETRY_ATTEMPTS, API_TIMEOUT_MS } from '@/lib/constants';

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';
const MOCK_API_URL = 'http://localhost:3001';
/** Default REST-API host (the TripKing Supabase project's Edge Functions). Overridden by `VITE_API_BASE_URL`. */
const PROD_API_FALLBACK = 'https://saxcbebqxgatiktsebxw.supabase.co/functions/v1';

export function getApiBaseUrl(): string {
  if (USE_MOCK_API) return MOCK_API_URL;
  if (import.meta.env.DEV) return '/api';
  const prod = import.meta.env.VITE_API_BASE_URL;
  return prod ? prod.replace(/\/+$/, '') : PROD_API_FALLBACK;
}

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  TIMEOUT: API_TIMEOUT_MS,
  RETRY_ATTEMPTS: API_RETRY_ATTEMPTS,
  USE_MOCK: USE_MOCK_API,
} as const;
