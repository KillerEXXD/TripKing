#!/usr/bin/env node
/**
 * Smoke test for the driver/manager KYC verification flow across the /drivers, /agents,
 * /vehicles, /video-verifications, /trips and /vacancies edge functions.
 *   KYC_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-kyc-flow.cjs
 * (also reads VITE_API_BASE_URL + '/functions/v1' as a fallback). Skips cleanly if unset.
 *
 * Covers: create driver → verification block (1/5); vehicle create + photo-upload-url +
 * bad-slot 422; book-before-docs 422; submit driver KYC docs → docs_submitted; available-slots;
 * book a slot → video_pending + Jitsi meeting url; double-book 409; post-trip/post-vacancy
 * KYC_REQUIRED 403 while unverified; admin finalize-without-all-gates 422; admin finalize
 * approved while vehicle photos still missing → kyc_status stays video_pending (no auto-promote);
 * admin fills vehicle photos via PATCH /vehicles/:id → kyc_status auto-promotes to
 * ready_for_approval; admin PATCH /drivers/:id/kyc { kyc_status: 'approved' } → approved +
 * kyc_status_change notification; admin PATCH /video-verifications/:id/status (the new manual
 * override endpoint) round-trips; post-trip succeeds after; admin console list; manager
 * (trip_manager) KYC: create agent (steps_total 3) + doc-upload-url + submit docs → docs_submitted.
 */
const BASE = (process.env.KYC_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-kyc-flow] KYC_API_BASE not set — skipping.'); process.exit(0); }
let failures = 0;
const ck = (name, cond, detail) => { if (cond) console.log(`  ✓ ${name}`); else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); } };
async function j(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json; const t = await res.text();
  try { json = JSON.parse(t); } catch { json = { raw: t }; }
  return { status: res.status, json };
}
async function tokenFor(role) {
  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const a = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Smoke ${role}`, role } });
  return a.json?.data?.access_token;
}

(async () => {
  console.log(`[test-kyc-flow] base = ${BASE}`);
  const dt = await tokenFor('driver');
  const at = await tokenFor('admin');
  ck('got driver + admin tokens', !!dt && !!at);

  const cities = await j('GET', '/admin/cities'); const cityId = cities.json?.data?.[0]?.id; const cityId2 = cities.json?.data?.[1]?.id ?? cityId;
  const cts = await j('GET', '/admin/car-types'); const ctId = cts.json?.data?.[0]?.id;
  ck('have a city + car type', !!cityId && !!ctId);

  const cr = await j('POST', '/drivers', { token: dt, body: { full_name: 'Smoke KYC Driver', home_city_id: cityId } });
  const did = cr.json?.data?.id;
  ck('create driver + verification 1/5', cr.status === 200 && did && cr.json?.data?.verification?.steps_done === 1 && cr.json?.data?.verification?.steps_total === 5);

  // vehicle
  const veh = await j('POST', '/vehicles', { token: dt, body: { car_type_id: ctId, year: 2022, seats: 5, registration_number: 'TN 09 AB 1234' } });
  const vid = veh.json?.data?.id;
  ck('create vehicle', veh.status === 200 && !!vid, JSON.stringify(veh.json?.error));
  const pu = await j('POST', `/vehicles/${vid}/photo-upload-url`, { token: dt, body: { slot: 'plate' } });
  ck('vehicle photo-upload-url (slot=plate → photo_plate_url)', pu.status === 200 && !!pu.json?.data?.signed_url && pu.json?.data?.column === 'photo_plate_url', JSON.stringify(pu.json));
  ck('vehicle photo-upload-url bad slot → 422', (await j('POST', `/vehicles/${vid}/photo-upload-url`, { token: dt, body: { slot: 'roof' } })).status === 422);

  // can't book a video call before docs are submitted
  ck('book before docs → 422', (await j('POST', '/video-verifications', { token: dt, body: { slot_at: new Date(Date.now() + 86400000).toISOString() } })).status === 422);

  // submit driver KYC docs
  const sub = await j('POST', `/drivers/${did}/kyc-docs`, { token: dt, body: { consent: true, aadhaar_front_path: `${did}/aadhaar_front`, aadhaar_back_path: `${did}/aadhaar_back`, driver_license_path: `${did}/driver_license`, selfie_path: `${did}/selfie`, aadhaar_last4: '9999', driver_license_number: 'TN09-2021-99999', driver_license_expiry: '2031-01-01' } });
  ck('submit docs → docs_submitted + masked', sub.status === 200 && sub.json?.data?.kyc_status === 'docs_submitted' && sub.json?.data?.aadhaar_number_masked === '••••9999' && sub.json?.data?.verification?.steps?.documents === 'done');
  ck('submit-docs no consent → 422', (await j('POST', `/drivers/${did}/kyc-docs`, { token: dt, body: {} })).status === 422);
  ck('submit-docs path outside own folder → 422', (await j('POST', `/drivers/${did}/kyc-docs`, { token: dt, body: { consent: true, aadhaar_front_path: '00000000-0000-0000-0000-000000000000/aadhaar_front', aadhaar_back_path: `${did}/aadhaar_back`, driver_license_path: `${did}/dl`, selfie_path: `${did}/selfie`, aadhaar_last4: '1234', driver_license_number: 'X' } })).status === 422);

  // available slots + book
  const slots = await j('GET', '/video-verifications/available-slots', { token: dt });
  ck('available-slots', slots.status === 200 && Array.isArray(slots.json?.data) && slots.json.data.length > 0, `n=${slots.json?.data?.length}`);
  const slot0 = slots.json?.data?.[0]?.slot_at;
  const bk = await j('POST', '/video-verifications', { token: dt, body: { slot_at: slot0 } });
  const vvid = bk.json?.data?.id;
  ck('book slot → scheduled + Jitsi url', bk.status === 200 && !!vvid && bk.json?.data?.status === 'scheduled' && /meet\.jit\.si\/tripking-/.test(bk.json?.data?.meeting_url || ''), JSON.stringify(bk.json?.error));
  const me1 = await j('GET', '/drivers/me', { token: dt });
  ck('driver kyc → video_pending (step scheduled)', me1.json?.data?.verification?.kyc_status === 'video_pending' && me1.json?.data?.verification?.steps?.video_call === 'scheduled' && me1.json?.data?.verification?.video_verification?.id === vvid);
  ck('double-book → 409', (await j('POST', '/video-verifications', { token: dt, body: { slot_at: slots.json?.data?.[1]?.slot_at } })).status === 409);

  // KYC gating while unverified
  const postTripUnv = await j('POST', '/trips', { token: dt, body: { from_city_id: cityId, to_city_id: cityId2, pickup_at: new Date(Date.now() + 172800000).toISOString(), car_type_id: ctId, expected_distance_km: 120, rate_per_km: 14, hide_passenger_phone: false, passenger_count: 1 } });
  ck('post trip while unverified → 403 KYC_REQUIRED', postTripUnv.status === 403 && postTripUnv.json?.error?.code === 'KYC_REQUIRED', JSON.stringify(postTripUnv.json?.error));
  ck('post vacancy while unverified → 403 KYC_REQUIRED', (await j('POST', '/vacancies', { token: dt, body: { current_city_id: cityId } })).status === 403);

  // admin finalize
  ck('finalize approve without all 3 gates → 422', (await j('PATCH', `/video-verifications/${vvid}/finalize`, { token: at, body: { outcome: 'approved', face_match_confirmed: true, documents_confirmed: true, liveness_check_passed: false } })).status === 422);
  const fin = await j('PATCH', `/video-verifications/${vvid}/finalize`, { token: at, body: { outcome: 'approved', face_match_confirmed: true, documents_confirmed: true, liveness_check_passed: true, notes: 'all good' } });
  ck('finalize approved (video row)', fin.status === 200 && fin.json?.data?.status === 'completed' && fin.json?.data?.outcome === 'approved');
  // Vehicle photos still missing → no auto-promote; subject sits at video_pending until photos arrive.
  const me2 = await j('GET', '/drivers/me', { token: dt });
  ck('finalize w/ missing vehicle photos → kyc stays video_pending (step video_call done)', me2.json?.data?.verification?.kyc_status === 'video_pending' && me2.json?.data?.verification?.steps?.video_call === 'done');
  // Backfill vehicle photos (admin) → maybePromoteToReadyForApproval kicks in.
  const fakeUrl = 'https://example.com/photo.jpg';
  const photoPatch = await j('PATCH', `/vehicles/${vid}`, { token: at, body: { photo_front_url: fakeUrl, photo_back_url: fakeUrl, photo_left_url: fakeUrl, photo_right_url: fakeUrl, photo_plate_url: fakeUrl, rc_book_url: fakeUrl, insurance_url: fakeUrl } });
  ck('admin backfill vehicle photos', photoPatch.status === 200, JSON.stringify(photoPatch.json?.error));
  const me3 = await j('GET', '/drivers/me', { token: dt });
  ck('all steps done → kyc auto-promoted to ready_for_approval', me3.json?.data?.verification?.kyc_status === 'ready_for_approval' && me3.json?.data?.verification?.steps_done === 5);
  // Admin clicks Approve.
  const approvePatch = await j('PATCH', `/drivers/${did}/kyc`, { token: at, body: { kyc_status: 'approved' } });
  ck('admin approves ready_for_approval → approved', approvePatch.status === 200 && approvePatch.json?.data?.verification?.kyc_status === 'approved');
  const notifs = await j('GET', '/notifications', { token: dt });
  ck('kyc_status_change notification fired', (notifs.json?.data || []).some((n) => n.type === 'kyc_status_change'));
  ck('post trip after approval → 200', (await j('POST', '/trips', { token: dt, body: { from_city_id: cityId, to_city_id: cityId2, pickup_at: new Date(Date.now() + 172800000).toISOString(), car_type_id: ctId, expected_distance_km: 120, rate_per_km: 14, hide_passenger_phone: false, passenger_count: 1 } })).status === 200);
  ck('admin console list (status=completed)', (await j('GET', '/video-verifications?status=completed', { token: at })).status === 200);
  // PATCH /video-verifications/:id/status (admin manual override) — re-set notes; subject already approved so we leave outcome alone.
  const statusPatch = await j('PATCH', `/video-verifications/${vvid}/status`, { token: at, body: { notes: 'admin override note (smoke)' } });
  ck('admin PATCH /video-verifications/:id/status → 200', statusPatch.status === 200 && statusPatch.json?.data?.notes === 'admin override note (smoke)', JSON.stringify(statusPatch.json?.error));
  ck('PATCH /video-verifications/:id/status as non-admin → 403', (await j('PATCH', `/video-verifications/${vvid}/status`, { token: dt, body: { notes: 'nope' } })).status === 403);

  // manager KYC
  const mt = await tokenFor('trip_manager');
  const mc = await j('POST', '/agents', { token: mt, body: { full_name: 'Smoke Mgr', business_city_id: cityId } });
  const mid = mc.json?.data?.id;
  ck('create agent + verification steps_total 3', mc.status === 200 && !!mid && mc.json?.data?.verification?.steps_total === 3);
  ck('agent doc-upload-url', (await j('POST', `/agents/${mid}/kyc-doc-upload-url`, { token: mt, body: { doc_type: 'aadhaar_front' } })).status === 200);
  ck('agent doc-upload-url bad type (driver_license) → 422', (await j('POST', `/agents/${mid}/kyc-doc-upload-url`, { token: mt, body: { doc_type: 'driver_license' } })).status === 422);
  const msub = await j('POST', `/agents/${mid}/kyc-docs`, { token: mt, body: { consent: true, aadhaar_front_path: `${mid}/aadhaar_front`, aadhaar_back_path: `${mid}/aadhaar_back`, selfie_path: `${mid}/selfie`, aadhaar_last4: '1212' } });
  ck('agent submit docs → docs_submitted', msub.status === 200 && msub.json?.data?.kyc_status === 'docs_submitted' && msub.json?.data?.verification?.steps?.documents === 'done');

  console.log(failures === 0 ? '\n[test-kyc-flow] ALL GOOD' : `\n[test-kyc-flow] ${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('[test-kyc-flow] ERROR', e && e.stack || e); process.exit(1); });
