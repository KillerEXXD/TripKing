import { describe, it, expect } from 'vitest';
import { corsHeaders, preflight, withCors } from '../cors.js';

describe('preflight', () => {
  it('returns 204 with CORS headers on OPTIONS', () => {
    const r = preflight(new Request('https://api.tripkingapp.com/x', { method: 'OPTIONS' }));
    expect(r).not.toBeNull();
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(r.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
  });

  it('returns null for non-OPTIONS', () => {
    expect(preflight(new Request('https://api.tripkingapp.com/x', { method: 'GET' }))).toBeNull();
    expect(preflight(new Request('https://api.tripkingapp.com/x', { method: 'POST' }))).toBeNull();
  });
});

describe('withCors', () => {
  it('stamps every cors header onto the response', () => {
    const original = new Response('{}', { status: 200, headers: { 'X-Other': '1' } });
    const tagged = withCors(original);
    for (const k of Object.keys(corsHeaders)) {
      expect(tagged.headers.get(k)).toBe(corsHeaders[k]);
    }
    expect(tagged.headers.get('X-Other')).toBe('1');
    expect(tagged.status).toBe(200);
  });

  it('exposes the observability headers the client cares about', () => {
    const tagged = withCors(new Response(''));
    const expose = tagged.headers.get('Access-Control-Expose-Headers') ?? '';
    expect(expose).toContain('X-Cache');
    expect(expose).toContain('X-Cache-Tier');
    expect(expose).toContain('Server-Timing');
    expect(expose).toContain('CF-Cache-Status');
  });
});
