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

    const res = await apiClient.get<{ id: string }[]>('/app/trips', { status: 'open', limit: 20, ids: ['a', 'b'] });

    expect(res.data).toEqual([{ id: 't1' }]);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/app/trips?');
    expect(calledUrl).toContain('status=open');
    expect(calledUrl).toContain('limit=20');
    expect(calledUrl).toContain('ids=a');
    expect(calledUrl).toContain('ids=b');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('GET');
  });

  it('POST sends a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { id: 'x' }, error: null }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.post('/app/trips', { from_city_id: 'c1' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ from_city_id: 'c1' }));
  });

  it('attaches Authorization: Bearer when an access token is stored, and does NOT send X-API-Key alongside (regression — item 6.6 of #114)', async () => {
    apiClient.setTokens('access-123', 'refresh-456');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null, error: null }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/me');

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer access-123');
    // X-API-Key is the anonymous-read credential; once a Bearer is present, sending the key
    // alongside is meaningless (the Bearer wins) and only leaks it into edge-fn/CDN logs.
    expect(headers['X-API-Key']).toBeUndefined();
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

    await expect(apiClient.get('/app/trips/nope')).rejects.toMatchObject({
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

  it('on 401 + refresh-also-401, clears tokens immediately so the next 401-retry short-circuits (no second doomed /auth/refresh)', async () => {
    apiClient.setTokens('expired-access', 'stale-refresh');
    const onAuthFail = vi.fn();
    apiClient.onAuthFailure(onAuthFail);
    const fetchMock = vi
      .fn()
      // 1: original request → 401
      .mockResolvedValueOnce(jsonResponse({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401))
      // 2: POST /auth/refresh → 401 (refresh-token also expired)
      .mockResolvedValueOnce(jsonResponse({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'bad refresh' } }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get<{ id: string }>('/me')).rejects.toThrow();

    // Exactly TWO fetch calls — the original GET and one POST /auth/refresh. The reactive
    // refresh that the request loop would normally fire on 401 short-circuits because
    // refreshSession() already cleared the refresh token after the first failure.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(apiClient.getAccessToken()).toBeNull();
    expect(apiClient.getRefreshToken()).toBeNull();
    expect(onAuthFail).toHaveBeenCalled();
  });

  it('GET dedup — concurrent identical GETs share one network request', async () => {
    let resolveFetch: (v: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const a = apiClient.get<{ id: string }>('/app/trips', { status: 'open' });
    const b = apiClient.get<{ id: string }>('/app/trips', { status: 'open' });
    const c = apiClient.get<{ id: string }>('/app/trips', { status: 'open' });

    // Single in-flight fetch despite 3 callers.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse({ success: true, data: { id: 't1' }, error: null }));
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra.data).toEqual({ id: 't1' });
    expect(rb.data).toEqual({ id: 't1' });
    expect(rc.data).toEqual({ id: 't1' });

    // After settle, a new GET runs the fetcher again (no permanent share).
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 't2' }, error: null }));
    const d = await apiClient.get<{ id: string }>('/app/trips', { status: 'open' });
    expect(d.data).toEqual({ id: 't2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET dedup — different tokens do NOT share an in-flight promise', async () => {
    // First caller — no token.
    let resolveAnon: (v: Response) => void = () => undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveAnon = resolve; }))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ success: true, data: { who: 'authed' }, error: null })));
    vi.stubGlobal('fetch', fetchMock);

    const anonPromise = apiClient.get<{ who: string }>('/me');
    // Now sign in mid-flight and fire the same URL — should NOT reuse the anon promise.
    apiClient.setTokens('a'.repeat(80), 'r');
    const authedPromise = apiClient.get<{ who: string }>('/me');

    expect(fetchMock).toHaveBeenCalledTimes(2); // two separate requests despite the same URL

    resolveAnon(jsonResponse({ success: true, data: { who: 'anon' }, error: null }));
    const [anon, authed] = await Promise.all([anonPromise, authedPromise]);
    expect(anon.data).toEqual({ who: 'anon' });
    expect(authed.data).toEqual({ who: 'authed' });
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
