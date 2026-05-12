import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '@/lib/api/client';

// ── working in-memory localStorage (setup.ts mocks it with bare vi.fn()s) ──
function installLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('apiClient', () => {
  beforeEach(() => {
    installLocalStorage();
    apiClient.clearTokens();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET serializes query params and unwraps the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [{ id: 't1' }], error: null }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiClient.get<{ id: string }[]>('/trips', { status: 'open', limit: 20, ids: ['a', 'b'] });

    expect(res.data).toEqual([{ id: 't1' }]);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/trips?');
    expect(calledUrl).toContain('status=open');
    expect(calledUrl).toContain('limit=20');
    expect(calledUrl).toContain('ids=a');
    expect(calledUrl).toContain('ids=b');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('GET');
  });

  it('POST sends a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { id: 'x' }, error: null }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.post('/trips', { from_city_id: 'c1' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ from_city_id: 'c1' }));
  });

  it('attaches Authorization: Bearer when an access token is stored', async () => {
    apiClient.setTokens('access-123', 'refresh-456');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null, error: null }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/me');

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer access-123');
  });

  it('does NOT attach auth headers on /auth endpoints', async () => {
    apiClient.setTokens('access-123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { access_token: 'a', refresh_token: 'r' }, error: null }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.post('/auth/verify-otp', { phone: '+91999', otp: '123456' });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('throws ApiError with status + code on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Trip not found' } }, 404),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/trips/nope')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Trip not found',
    });
  });

  it('on 401 refreshes the session once and retries', async () => {
    apiClient.setTokens('expired-access', 'good-refresh');
    const fetchMock = vi
      .fn()
      // 1: original request → 401
      .mockResolvedValueOnce(jsonResponse({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401))
      // 2: POST /auth/refresh → new tokens
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { access_token: 'fresh-access', refresh_token: 'fresh-refresh' }, error: null }))
      // 3: retried request → ok
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'me' }, error: null }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiClient.get<{ id: string }>('/me');

    expect(res.data).toEqual({ id: 'me' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(apiClient.getAccessToken()).toBe('fresh-access');
    // retried call carries the new token
    const retryHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer fresh-access');
  });

  it('on 401 with a failed refresh, clears tokens and calls onAuthFailure', async () => {
    apiClient.setTokens('expired-access', 'stale-refresh');
    const onAuthFailure = vi.fn();
    apiClient.onAuthFailure(onAuthFailure);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, data: null, error: { code: 'INVALID_REFRESH', message: 'nope' } }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(apiClient.getAccessToken()).toBeNull();
    expect(apiClient.getRefreshToken()).toBeNull();
    expect(onAuthFailure).toHaveBeenCalledOnce();
  });
});
