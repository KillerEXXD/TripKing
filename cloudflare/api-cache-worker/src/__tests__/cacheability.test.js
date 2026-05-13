import { describe, it, expect } from 'vitest';
import { shouldAttemptCache, shouldStoreResponse } from '../cacheability.js';

const ANON = 'sb_publishable_test_key';

function req(method, headers = {}) {
  return new Request('https://api.tripkingapp.com/functions/v1/admin/car-types', { method, headers });
}

describe('shouldAttemptCache', () => {
  it('caches anonymous GETs', () => {
    expect(shouldAttemptCache(req('GET'), ANON)).toBe(true);
  });

  it('caches GETs that present the anon Bearer (= apikey)', () => {
    expect(shouldAttemptCache(req('GET', { authorization: `Bearer ${ANON}` }), ANON)).toBe(true);
  });

  it('bypasses GETs with a user Bearer (any non-anon token)', () => {
    expect(shouldAttemptCache(req('GET', { authorization: 'Bearer ey-user-jwt' }), ANON)).toBe(false);
  });

  it('bypasses GETs with non-Bearer auth schemes', () => {
    expect(shouldAttemptCache(req('GET', { authorization: 'Basic dXNlcjpwYXNz' }), ANON)).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('bypasses %s', (method) => {
    expect(shouldAttemptCache(req(method), ANON)).toBe(false);
  });

  it('handles the Authorization header in either case', () => {
    expect(shouldAttemptCache(req('GET', { Authorization: `Bearer ${ANON}` }), ANON)).toBe(true);
    expect(shouldAttemptCache(req('GET', { Authorization: 'Bearer user-jwt' }), ANON)).toBe(false);
  });
});

describe('shouldStoreResponse', () => {
  function res(status, cacheControl) {
    const headers = cacheControl ? { 'Cache-Control': cacheControl } : {};
    return new Response('{}', { status, headers });
  }

  it('stores 2xx with explicit public Cache-Control', () => {
    expect(shouldStoreResponse(res(200, 'public, max-age=900, s-maxage=900'))).toBe(true);
  });

  it('rejects private', () => {
    expect(shouldStoreResponse(res(200, 'private, max-age=60'))).toBe(false);
  });

  it('rejects no-store', () => {
    expect(shouldStoreResponse(res(200, 'public, max-age=900, no-store'))).toBe(false);
  });

  it('rejects no-cache', () => {
    expect(shouldStoreResponse(res(200, 'public, no-cache'))).toBe(false);
  });

  it('rejects missing Cache-Control', () => {
    expect(shouldStoreResponse(res(200))).toBe(false);
  });

  it('rejects non-2xx even with public Cache-Control', () => {
    expect(shouldStoreResponse(res(404, 'public, max-age=900'))).toBe(false);
    expect(shouldStoreResponse(res(500, 'public, max-age=900'))).toBe(false);
    expect(shouldStoreResponse(res(302, 'public, max-age=900'))).toBe(false);
  });
});
