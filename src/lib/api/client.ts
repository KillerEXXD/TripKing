/**
 * API Client
 *
 * Centralized fetch wrapper with auth headers + structured error handling.
 * Mirrors `hudr-pwa/src/lib/api/client.ts`.
 *
 * Headers:
 *  - X-API-Key — required for public endpoints
 *  - Authorization: Bearer — JWT for authenticated endpoints
 */

import { API_CONFIG } from '@/config/api';

const API_KEY = import.meta.env.VITE_DRIVERMAHAL_API_KEY || '';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    pages?: number;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getResponseError(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    return JSON.stringify(error);
  }
  return fallback;
}

class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private getAuthToken: (() => string | null) | null = null;

  constructor() {
    this.baseUrl = API_CONFIG.baseUrl;
    this.timeout = API_CONFIG.timeoutMs;
  }

  /** Inject the auth-token getter (set by `AuthContext` on user login). */
  setAuthTokenGetter(fn: () => string | null) {
    this.getAuthToken = fn;
  }

  private buildHeaders(extra?: HeadersInit): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (API_KEY) headers['X-API-Key'] = API_KEY;
    const token = this.getAuthToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return { ...headers, ...(extra as Record<string, string>) };
  }

  async request<T = unknown>(
    endpoint: string,
    init: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        ...init,
        headers: this.buildHeaders(init.headers),
        signal: controller.signal,
      });

      const text = await res.text();
      const json = text ? (JSON.parse(text) as ApiResponse<T>) : { success: res.ok };

      if (!res.ok) {
        throw new ApiError(
          getResponseError(json.error, `HTTP ${res.status}`),
          res.status,
          json as unknown as Record<string, unknown>,
        );
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  get<T = unknown>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }
  post<T = unknown>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  patch<T = unknown>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  delete<T = unknown>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
