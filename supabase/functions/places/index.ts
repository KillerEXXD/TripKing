/**
 * /places/* — maps-backed location lookup (Phase B of the locations epic).
 *
 *   GET  /places/search?q=&near_lat=&near_lng=&limit=   (public) — server-side proxy to a
 *        geocoder. Provider picked from PLACES_PROVIDER (locationiq | geoapify | nominatim |
 *        google) + PLACES_API_KEY; biased to India; does NOT persist. Returns
 *        { success, data: [{ provider, providerPlaceId, name, formattedAddress, state, lat, lng }], error }.
 *        Rate-limited per IP (per-keystroke path; debounced client-side too). Cache headers set.
 *        Until a key is configured the default provider is `nominatim` (OSM, no key, dev-grade);
 *        a key-requiring provider with no key → an empty list.
 *   POST /places { provider, providerPlaceId, name, formattedAddress?, state?, lat, lng, cityId? }
 *        (public) — find-or-create by (provider, provider_place_id); fallback: a ~5dp lat/lng match.
 *        Returns the stored Place with its id. Rate-limited per IP.
 *
 * withTiming; verify_jwt = false (no auth required — same posture as the public /trips, /vacancies reads).
 * Admin GET/PATCH /admin/places (dedupe / deactivate / set city_id) is deferred to a follow-up.
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders, corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';

type Db = ReturnType<typeof serviceClient>;
type Provider = 'locationiq' | 'geoapify' | 'nominatim' | 'google';

interface PlaceResult {
  provider: string;
  providerPlaceId: string | null;
  name: string;
  formattedAddress: string | null;
  state: string | null;
  lat: number;
  lng: number;
}

// ── small helpers ───────────────────────────────────────────────────────────
async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strOrNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
};
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}
const firstName = (s: unknown): string => (typeof s === 'string' ? s.split(',')[0].trim() : '');
function pgFail(error: { code?: string; message: string }): Response {
  if (error.code === '23505') return fail('CONFLICT', error.message, 409);
  if (error.code === '23503') return fail('VALIDATION', error.message, 422);
  if (error.code === '23502' || error.code === '23514' || error.code === '22P02') return fail('VALIDATION', error.message, 422);
  return fail('DB_ERROR', error.message, 400);
}
/** Like `ok()` but with a `Cache-Control` header — `/places/search` is cacheable (same q ⇒ same result). */
function okCached(data: unknown, maxAgeSec: number): Response {
  return new Response(JSON.stringify({ success: true, data, error: null }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAgeSec}` },
  });
}
function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'anon';
}

// ── geocoder adapters ───────────────────────────────────────────────────────
/** Build the upstream request + a parser for the chosen provider. Returns null if the
 *  provider needs an API key and none is set (caller then returns an empty list). */
function buildSearch(
  provider: Provider,
  key: string,
  q: string,
  nearLat: number | null,
  nearLng: number | null,
  limit: number,
): { url: string; headers: Record<string, string>; parse: (j: unknown) => PlaceResult[] } | null {
  const lim = String(Math.min(Math.max(limit, 1), 10));
  switch (provider) {
    case 'nominatim': {
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.searchParams.set('format', 'jsonv2');
      u.searchParams.set('q', q);
      u.searchParams.set('countrycodes', 'in');
      u.searchParams.set('limit', lim);
      u.searchParams.set('addressdetails', '1');
      if (nearLat != null && nearLng != null) {
        const d = 1; // ~1° bias box (unbounded ⇒ a soft proximity bias, not a hard filter)
        u.searchParams.set('viewbox', `${nearLng - d},${nearLat + d},${nearLng + d},${nearLat - d}`);
      }
      return {
        url: u.toString(),
        headers: { 'User-Agent': 'TripKing/1.0 (https://trip-king.vercel.app)', Accept: 'application/json' },
        parse: (j) => (Array.isArray(j) ? (j as Record<string, unknown>[]) : []).map((r) => ({
          provider: 'nominatim',
          providerPlaceId: r.place_id != null ? String(r.place_id) : null,
          name: (typeof r.name === 'string' && r.name) || firstName(r.display_name) || 'Unnamed place',
          formattedAddress: typeof r.display_name === 'string' ? r.display_name : null,
          state: (r.address as Record<string, unknown> | undefined)?.state as string | undefined ?? null,
          lat: Number(r.lat),
          lng: Number(r.lon),
        })),
      };
    }
    case 'locationiq': {
      if (!key) return null;
      const u = new URL('https://us1.locationiq.com/v1/search');
      u.searchParams.set('key', key);
      u.searchParams.set('q', q);
      u.searchParams.set('format', 'json');
      u.searchParams.set('countrycodes', 'in');
      u.searchParams.set('limit', lim);
      u.searchParams.set('addressdetails', '1');
      if (nearLat != null && nearLng != null) {
        u.searchParams.set('lat', String(nearLat));
        u.searchParams.set('lon', String(nearLng));
      }
      return {
        url: u.toString(),
        headers: { Accept: 'application/json' },
        parse: (j) => (Array.isArray(j) ? (j as Record<string, unknown>[]) : []).map((r) => ({
          provider: 'locationiq',
          providerPlaceId: r.place_id != null ? String(r.place_id) : null,
          name: (typeof r.name === 'string' && r.name) || firstName(r.display_name) || 'Unnamed place',
          formattedAddress: typeof r.display_name === 'string' ? r.display_name : null,
          state: (r.address as Record<string, unknown> | undefined)?.state as string | undefined ?? null,
          lat: Number(r.lat),
          lng: Number(r.lon),
        })),
      };
    }
    case 'geoapify': {
      if (!key) return null;
      const u = new URL('https://api.geoapify.com/v1/geocode/search');
      u.searchParams.set('text', q);
      u.searchParams.set('filter', 'countrycode:in');
      u.searchParams.set('limit', lim);
      u.searchParams.set('apiKey', key);
      if (nearLat != null && nearLng != null) u.searchParams.set('bias', `proximity:${nearLng},${nearLat}`);
      return {
        url: u.toString(),
        headers: { Accept: 'application/json' },
        parse: (j) => {
          const features = (j as { features?: unknown })?.features;
          return (Array.isArray(features) ? (features as Record<string, unknown>[]) : []).map((f) => {
            const p = (f.properties ?? {}) as Record<string, unknown>;
            return {
              provider: 'geoapify',
              providerPlaceId: p.place_id != null ? String(p.place_id) : null,
              name: (typeof p.name === 'string' && p.name) || (typeof p.address_line1 === 'string' && p.address_line1) || firstName(p.formatted) || 'Unnamed place',
              formattedAddress: typeof p.formatted === 'string' ? p.formatted : null,
              state: typeof p.state === 'string' ? p.state : null,
              lat: Number(p.lat),
              lng: Number(p.lon),
            };
          });
        },
      };
    }
    case 'google': {
      if (!key) return null;
      const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      u.searchParams.set('address', q);
      u.searchParams.set('components', 'country:IN');
      u.searchParams.set('key', key);
      return {
        url: u.toString(),
        headers: { Accept: 'application/json' },
        parse: (j) => {
          const results = (j as { results?: unknown })?.results;
          return (Array.isArray(results) ? (results as Record<string, unknown>[]) : []).slice(0, Number(lim)).map((r) => {
            const comps = (Array.isArray(r.address_components) ? r.address_components : []) as Record<string, unknown>[];
            const state = comps.find((c) => Array.isArray(c.types) && (c.types as string[]).includes('administrative_area_level_1'))?.long_name as string | undefined ?? null;
            const loc = ((r.geometry as Record<string, unknown> | undefined)?.location ?? {}) as Record<string, unknown>;
            return {
              provider: 'google',
              providerPlaceId: r.place_id != null ? String(r.place_id) : null,
              name: (comps[0]?.long_name as string | undefined) || firstName(r.formatted_address) || 'Unnamed place',
              formattedAddress: typeof r.formatted_address === 'string' ? r.formatted_address : null,
              state,
              lat: Number(loc.lat),
              lng: Number(loc.lng),
            };
          });
        },
      };
    }
  }
  return null;
}

const handler = withTiming('places', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const url = new URL(req.url);
  const m = url.pathname.match(/\/places(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const ip = clientIp(req);

  // ── GET /places/search ───────────────────────────────────────────────────
  if (segs[0] === 'search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2) return okCached([], 60); // too short to bother a geocoder
    const db = serviceClient();
    if (!(await rateLimitOk(db, `places-search:${ip}`, 60, 60))) return fail('RATE_LIMITED', 'Too many searches — slow down', 429);

    const provider = ((Deno.env.get('PLACES_PROVIDER') ?? 'nominatim').toLowerCase()) as Provider;
    const key = (Deno.env.get('PLACES_API_KEY') ?? '').trim();
    const nearLat = num(url.searchParams.get('near_lat'));
    const nearLng = num(url.searchParams.get('near_lng'));
    const limit = num(url.searchParams.get('limit')) ?? 6;

    const spec = buildSearch(provider, key, q, nearLat, nearLng, limit);
    if (!spec) {
      console.warn(`[places] provider "${provider}" requires PLACES_API_KEY (not set) — returning []`);
      return okCached([], 30);
    }
    try {
      const res = await fetch(spec.url, { headers: spec.headers });
      if (!res.ok) {
        console.warn(`[places] ${provider} responded HTTP ${res.status}`);
        return okCached([], 30);
      }
      const j = await res.json().catch(() => null);
      const out = spec.parse(j).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)).slice(0, Math.min(Math.max(limit, 1), 10));
      return okCached(out, 300);
    } catch (e) {
      console.warn(`[places] ${provider} fetch failed:`, e);
      return okCached([], 30);
    }
  }

  // ── POST /places — find-or-create ────────────────────────────────────────
  if (segs.length === 0 && req.method === 'POST') {
    const db = serviceClient();
    if (!(await rateLimitOk(db, `places-create:${ip}`, 120, 60))) return fail('RATE_LIMITED', 'Too many requests — slow down', 429);
    const b = await readBody(req);
    const provider = str(b.provider);
    const providerPlaceId = strOrNull(b.providerPlaceId ?? b.provider_place_id);
    const name = str(b.name);
    const lat = num(b.lat);
    const lng = num(b.lng);
    if (!provider || !name || lat == null || lng == null) return fail('VALIDATION', 'provider, name, lat and lng are required', 422);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return fail('VALIDATION', 'lat must be in [-90,90] and lng in [-180,180]', 422);
    const formattedAddress = strOrNull(b.formattedAddress ?? b.formatted_address);
    const state = strOrNull(b.state);
    const cityId = strOrNull(b.cityId ?? b.city_id);

    // find: by (provider, provider_place_id) if we have one; else a ~5dp lat/lng + provider match.
    let existing: Record<string, unknown> | null = null;
    if (providerPlaceId) {
      const { data } = await db.from('places').select('*').eq('provider', provider).eq('provider_place_id', providerPlaceId).maybeSingle();
      existing = data ?? null;
    } else {
      const eps = 0.00001; // ~1m at the equator — collapses near-identical ad-hoc points
      const { data } = await db.from('places').select('*').eq('provider', provider)
        .gte('lat', lat - eps).lte('lat', lat + eps).gte('lng', lng - eps).lte('lng', lng + eps).limit(1);
      existing = (data && data[0]) ?? null;
    }
    if (existing) return ok(existing);

    const insert: Record<string, unknown> = { provider, provider_place_id: providerPlaceId, name, formatted_address: formattedAddress, state, lat, lng };
    if (cityId) insert.city_id = cityId;
    const { data: created, error } = await db.from('places').insert(insert).select('*').single();
    if (error) {
      if (error.code === '23505' && providerPlaceId) {
        // race — another request inserted the same (provider, provider_place_id) first
        const { data } = await db.from('places').select('*').eq('provider', provider).eq('provider_place_id', providerPlaceId).maybeSingle();
        if (data) return ok(data);
      }
      return pgFail(error);
    }
    return ok(created);
  }

  return fail('NOT_FOUND', 'Use GET /places/search?q= or POST /places', 404);
});

serve(handler);
