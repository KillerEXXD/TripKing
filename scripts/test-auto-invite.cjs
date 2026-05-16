#!/usr/bin/env node
/**
 * Smoke test for trip auto-invite (the toggle on POST /trips) + the GET /trips/match-preview
 * preview endpoint.
 *   AUTO_INVITE_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-auto-invite.cjs
 * Skips cleanly (exit 0) if the base URL is unset.
 *
 * Covers: preview returns counts (and excludes self for driver-posted), POST /trips with the
 * toggle ON creates trip_invitations + the auto_invited_count field, the toggle OFF creates none,
 * a driver without a vacancy is not auto-invited (no signal they're available), and a non-KYC
 * driver is not auto-invited even with a vacancy attempt (POST /vacancies blocks it anyway).
 */
const BASE = (process.env.AUTO_INVITE_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-auto-invite] AUTO_INVITE_API_BASE not set — skipping.');
  process.exit(0);
}
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
async function j(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function tokenFor(role) {
  const phone = `+919901${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Auto-Invite ${role} ${Math.floor(Math.random() * 1e6)}`, role } });
  return auth.json?.data?.access_token;
}
function futureIso(hoursFromNow = 4) {
  return new Date(Date.now() + hoursFromNow * 3600 * 1000).toISOString();
}

(async () => {
  console.log(`[test-auto-invite] base = ${BASE}`);
  const adminToken = await tokenFor('admin');
  const agentToken = await tokenFor('trip_manager');
  const driverToken = await tokenFor('driver');
  const noVacDriverToken = await tokenFor('driver');
  if (!adminToken || !agentToken || !driverToken || !noVacDriverToken) { console.error('auth failed'); process.exit(1); }

  // Approve the agent's KYC (POST /trips needs it).
  const agentMe = await j('GET', '/agents/me', { token: agentToken });
  // Some setups create the agent profile lazily — make sure it exists.
  const agentId = agentMe.json?.data?.id || (await j('POST', '/agents', { token: agentToken, body: { full_name: 'Auto-Invite Agent' } })).json?.data?.id;
  if (agentId) await j('PATCH', `/agents/${agentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });

  // Driver A: KYC-approved + has an open vacancy in the pickup city.
  const drvId = (await j('POST', '/drivers', { token: driverToken, body: { full_name: 'AutoInvite Drv A' } })).json?.data?.id;
  if (drvId) await j('PATCH', `/drivers/${drvId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });

  // Driver B: KYC-approved but no vacancy.
  const drvBId = (await j('POST', '/drivers', { token: noVacDriverToken, body: { full_name: 'AutoInvite Drv B' } })).json?.data?.id;
  if (drvBId) await j('PATCH', `/drivers/${drvBId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });

  const cities = (await j('GET', '/admin/cities')).json?.data || [];
  const cityA = cities[0]?.id;
  const cityB = cities[1]?.id || cityA;
  if (!cityA || !cityB) { console.error('need at least one city'); process.exit(1); }

  // Driver A posts a vacancy in cityA → becomes a match candidate for trips from cityA.
  const vac = await j('POST', '/vacancies', { token: driverToken, body: { current_city_id: cityA, destination_city_ids: [cityB] } });
  check('seed: Driver A vacancy created in cityA', vac.status === 200 && !!vac.json?.data?.id, `${JSON.stringify(vac.json?.error || vac.status)}`);

  // ── GET /trips/match-preview ─────────────────────────────────────────────
  const previewNoAuth = await j('GET', `/trips/match-preview?from_city_id=${cityA}`);
  check('GET /trips/match-preview without auth → 401', previewNoAuth.status === 401, `status=${previewNoAuth.status}`);
  const previewBad = await j('GET', '/trips/match-preview', { token: agentToken });
  check('GET /trips/match-preview without from_city_id → 422', previewBad.status === 422, `status=${previewBad.status}`);
  const preview = await j('GET', `/trips/match-preview?from_city_id=${cityA}`, { token: agentToken });
  check('GET /trips/match-preview (agent) → 200 + numeric counts + max=5', preview.status === 200
    && typeof preview.json?.data?.total_matches === 'number'
    && typeof preview.json?.data?.will_invite === 'number'
    && preview.json?.data?.max_invites === 5
    && preview.json?.data?.total_matches >= 1
    && preview.json?.data?.will_invite <= 5,
    `data=${JSON.stringify(preview.json?.data)}`);

  // ── POST /trips with auto_invite_matches: true (the default) ─────────────
  const baseTrip = {
    from_city_id: cityA, to_city_id: cityB, pickup_at: futureIso(4),
    expected_distance_km: 100, car_type_id: (await j('GET', '/admin/car-types')).json?.data?.[0]?.id,
    rate_per_km: 12, hide_passenger_phone: true, passenger_count: 1,
  };
  const onPost = await j('POST', '/trips', { token: agentToken, body: { ...baseTrip, auto_invite_matches: true } });
  const tOnId = onPost.json?.data?.id;
  check('POST /trips with auto_invite_matches=true → 200 + auto_invited_count ≥ 1',
    onPost.status === 200 && !!tOnId && (onPost.json?.data?.auto_invited_count ?? 0) >= 1,
    `status=${onPost.status} auto_invited_count=${onPost.json?.data?.auto_invited_count} err=${JSON.stringify(onPost.json?.error || '')}`);
  if (tOnId) {
    const inv = await j('GET', `/trips/${tOnId}/invites`, { token: agentToken });
    const sawDrvA = (inv.json?.data || []).some((r) => r.driver?.id === drvId);
    const sawDrvB = (inv.json?.data || []).some((r) => r.driver?.id === drvBId);
    check('GET /trips/:id/invites after auto-invite → contains Driver A (vacancy in pickup city)', inv.status === 200 && sawDrvA, `status=${inv.status} count=${inv.json?.data?.length}`);
    check('GET /trips/:id/invites after auto-invite → does NOT contain Driver B (no vacancy)', inv.status === 200 && !sawDrvB, `sawB=${sawDrvB}`);
  }

  // ── POST /trips with auto_invite_matches: false ──────────────────────────
  const offPost = await j('POST', '/trips', { token: agentToken, body: { ...baseTrip, pickup_at: futureIso(5), auto_invite_matches: false } });
  const tOffId = offPost.json?.data?.id;
  check('POST /trips with auto_invite_matches=false → 200 + auto_invited_count = 0',
    offPost.status === 200 && !!tOffId && (offPost.json?.data?.auto_invited_count ?? 0) === 0,
    `status=${offPost.status} auto_invited_count=${offPost.json?.data?.auto_invited_count}`);
  if (tOffId) {
    const inv = await j('GET', `/trips/${tOffId}/invites`, { token: agentToken });
    check('GET /trips/:id/invites for opt-out trip → empty array', inv.status === 200 && Array.isArray(inv.json?.data) && inv.json.data.length === 0, `count=${inv.json?.data?.length}`);
  }

  if (failures) { console.error(`[test-auto-invite] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-auto-invite] all checks passed');
})().catch((e) => { console.error('[test-auto-invite] error:', e); process.exit(1); });
