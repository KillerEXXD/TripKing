import { describe, it, expect } from 'vitest';
import { buildOriginRequest } from '../proxy.js';

const env = {
  SUPABASE_ORIGIN: 'https://saxcbebqxgatiktsebxw.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
};

describe('buildOriginRequest', () => {
  it('preserves path + query when rewriting host', () => {
    const incoming = new Request('https://api.tripkingapp.com/functions/v1/trips?status=open&limit=20');
    const out = buildOriginRequest(incoming, env);
    expect(out.url).toBe('https://saxcbebqxgatiktsebxw.supabase.co/functions/v1/trips?status=open&limit=20');
  });

  it('injects apikey + Bearer anon for an anonymous request', () => {
    const incoming = new Request('https://api.tripkingapp.com/functions/v1/admin/car-types');
    const out = buildOriginRequest(incoming, env);
    expect(out.headers.get('apikey')).toBe('anon-test-key');
    expect(out.headers.get('Authorization')).toBe('Bearer anon-test-key');
  });

  it('does NOT override an existing Authorization header', () => {
    const incoming = new Request('https://api.tripkingapp.com/functions/v1/drivers/me', {
      headers: { Authorization: 'Bearer user-jwt-12345' },
    });
    const out = buildOriginRequest(incoming, env);
    expect(out.headers.get('Authorization')).toBe('Bearer user-jwt-12345');
    // apikey is still injected so Supabase's gateway accepts the request
    expect(out.headers.get('apikey')).toBe('anon-test-key');
  });

  it('preserves the method', () => {
    const incoming = new Request('https://api.tripkingapp.com/functions/v1/trips', { method: 'POST', body: '{"a":1}' });
    const out = buildOriginRequest(incoming, env);
    expect(out.method).toBe('POST');
  });

  it('omits the body on GET / HEAD', () => {
    const get = buildOriginRequest(new Request('https://api.tripkingapp.com/x'), env);
    expect(get.body).toBeNull();
    const head = buildOriginRequest(new Request('https://api.tripkingapp.com/x', { method: 'HEAD' }), env);
    expect(head.body).toBeNull();
  });
});
