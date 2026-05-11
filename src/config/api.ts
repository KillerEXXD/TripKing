/**
 * API configuration.
 * Mirrors `hudr-pwa/src/config/api.ts`.
 */
export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_DRIVERMAHAL_API_URL || 'https://api.drivermahal.in',
  timeoutMs: 30_000,
} as const;
