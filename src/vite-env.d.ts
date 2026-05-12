/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Base URL of the TripKing REST API (prod). Dev uses the Vite `/api` proxy. */
  readonly VITE_API_BASE_URL?: string;
  /** Public API key sent as `X-API-Key` on browse endpoints. */
  readonly VITE_TRIPKING_API_KEY?: string;
  /** `'true'` → talk to a local mock API instead of the real one (early dev only). */
  readonly VITE_USE_MOCK_API?: string;
  /** Supabase project URL — used by edge functions / migration scripts, not the browser app. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_DAILY_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
