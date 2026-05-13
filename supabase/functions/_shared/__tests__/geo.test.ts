/**
 * Deno unit tests for parseNearRadius / toKm.
 *   Run:  deno test supabase/functions/_shared/__tests__/geo.test.ts
 */
import { MAX_RADIUS_KM, parseNearRadius, toKm } from '../geo.ts';

function url(qs: string): URL {
  return new URL(`https://x/${qs}`);
}

Deno.test('parseNearRadius — returns null when any of lat/lng/radius missing', () => {
  if (parseNearRadius(url('?near_lat=12&near_lng=80')) !== null) throw new Error('missing radius should be null');
  if (parseNearRadius(url('?near_lat=12&radius_km=10')) !== null) throw new Error('missing lng should be null');
  if (parseNearRadius(url('?near_lng=80&radius_km=10')) !== null) throw new Error('missing lat should be null');
  if (parseNearRadius(url('')) !== null) throw new Error('empty should be null');
});

Deno.test('parseNearRadius — returns null when values are non-numeric', () => {
  if (parseNearRadius(url('?near_lat=abc&near_lng=80&radius_km=10')) !== null) throw new Error('non-numeric lat');
});

Deno.test('parseNearRadius — rejects out-of-range lat/lng/radius', () => {
  if (parseNearRadius(url('?near_lat=91&near_lng=80&radius_km=10')) !== null) throw new Error('lat>90');
  if (parseNearRadius(url('?near_lat=12&near_lng=181&radius_km=10')) !== null) throw new Error('lng>180');
  if (parseNearRadius(url('?near_lat=12&near_lng=80&radius_km=0')) !== null) throw new Error('radius 0');
  if (parseNearRadius(url('?near_lat=12&near_lng=80&radius_km=-5')) !== null) throw new Error('radius -');
});

Deno.test('parseNearRadius — happy path returns metres', () => {
  const r = parseNearRadius(url('?near_lat=12.9&near_lng=80.2&radius_km=20'));
  if (!r) throw new Error('expected an object');
  if (r.lat !== 12.9 || r.lng !== 80.2) throw new Error('lat/lng wrong');
  if (r.radiusM !== 20000) throw new Error(`radiusM expected 20000, got ${r.radiusM}`);
});

Deno.test('parseNearRadius — caps the radius at MAX_RADIUS_KM', () => {
  const r = parseNearRadius(url('?near_lat=0&near_lng=0&radius_km=500'));
  if (!r) throw new Error('expected an object');
  if (r.radiusM !== MAX_RADIUS_KM * 1000) throw new Error('did not cap');
});

Deno.test('toKm — converts metres to km rounded to 1 dp', () => {
  if (toKm(1234) !== 1.2) throw new Error(`1234m -> ${toKm(1234)}`);
  if (toKm(1250) !== 1.3) throw new Error(`1250m -> ${toKm(1250)}`);
  if (toKm(0) !== 0) throw new Error('0m');
});
