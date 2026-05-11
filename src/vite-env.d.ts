/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_DRIVERMAHAL_API_URL: string;
  readonly VITE_DRIVERMAHAL_API_KEY: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_POSTHOG_KEY: string;
  readonly VITE_POSTHOG_HOST: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_DAILY_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
