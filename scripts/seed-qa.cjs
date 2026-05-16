#!/usr/bin/env node
/**
 * Seed 4 QA users × (Agent + Driver) into the dev Supabase project, then post
 * 2 vacancies per driver (tomorrow + day-after). Wipes the same 8 phones first
 * so the script is idempotent — run as many times as you need.
 *
 *   node scripts/seed-qa.cjs
 *
 * Reads VITE_API_BASE_URL from .env.development and the Supabase Management
 * access token from the Windows Credential Manager entry (`Supabase CLI:supabase`,
 * set by `npx supabase login`) — same pattern as scripts/db.cjs.
 *
 * Mnemonic: phone = "9" + 6 consecutive ascending digits starting at QA-index +
 * "100" for Agent / "200" for Driver. OTP is 12345 for everyone in dev.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_REF = 'saxcbebqxgatiktsebxw';

// ── env: VITE_API_BASE_URL ────────────────────────────────────────────────
function loadEnv() {
  const file = path.join(__dirname, '..', '.env.development');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const RAW_BASE =
  process.env.VITE_API_BASE_URL ||
  (process.env.VITE_SUPABASE_URL ? `${process.env.VITE_SUPABASE_URL}/functions/v1` : '');
if (!RAW_BASE) {
  console.error('[seed-qa] need VITE_API_BASE_URL or VITE_SUPABASE_URL in .env.development');
  process.exit(1);
}
const BASE = RAW_BASE.replace(/\/+$/, '');

// ── Management API token (for the wipe SQL) ──────────────────────────────
function getAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const ps = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public class Cr { [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CredReadW(string t,int ty,int f,out IntPtr c); [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr c); [StructLayout(LayoutKind.Sequential)] public struct CRED{ public int Flags;public int Type;public string TargetName;public string Comment;public long LastWritten;public int BlobSize;public IntPtr Blob;public int Persist;public int AttrCount;public IntPtr Attrs;public string TargetAlias;public string UserName;} public static string G(string t){ IntPtr p; if(CredReadW(t,1,0,out p)){ CRED c=(CRED)Marshal.PtrToStructure(p,typeof(CRED)); byte[] b=new byte[c.BlobSize]; Marshal.Copy(c.Blob,b,0,c.BlobSize); CredFree(p); return Encoding.UTF8.GetString(b);} return null;} }
"@; [Cr]::G("Supabase CLI:supabase")`;
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
async function runSql(query) {
  const token = getAccessToken();
  if (!token || !token.startsWith('sbp_')) {
    console.error('[seed-qa] no Supabase Management token — run `npx supabase login`.');
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

// ── edge-function helpers ────────────────────────────────────────────────
async function call(method, fnPath, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/${fnPath.replace(/^\/+/, '')}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

// ── QA roster ────────────────────────────────────────────────────────────
const QAS = [
  { idx: 1, digit: '123456', agentName: 'Rajesh Kumar',  driverName: 'Murugan S',    currentCity: 'Vellore',    dests: ['Chennai', 'Bangalore'],            hours: [9, 14] },
  { idx: 2, digit: '234567', agentName: 'Priya Sharma',  driverName: 'Karthik R',    currentCity: 'Chennai',    dests: ['Pondicherry', 'Tirupati'],         hours: [12, 18] },
  { idx: 3, digit: '345678', agentName: 'Vikram Raja',   driverName: 'Anand V',      currentCity: 'Bangalore',  dests: ['Salem', 'Coimbatore'],             hours: [15, 9] },
  { idx: 4, digit: '456789', agentName: 'Suresh Babu',   driverName: 'Saravanan M',  currentCity: 'Coimbatore', dests: ['Madurai', 'Tiruchirappalli'],      hours: [18, 11] },
];
const AGENT_PHONE = (q) => `+919${q.digit}100`;
const DRIVER_PHONE = (q) => `+919${q.digit}200`;
const ALL_PHONES = () => QAS.flatMap((q) => [AGENT_PHONE(q), DRIVER_PHONE(q)]);

// ── timing helpers ───────────────────────────────────────────────────────
function atDayHour(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ── Phase 1 — WIPE ───────────────────────────────────────────────────────
async function wipe() {
  const list = ALL_PHONES().map((p) => `'${p}'`).join(',');
  // auth.users cascades to public.users (FK ON DELETE CASCADE), which cascades to drivers,
  // trip_managers, vacancies, vacancy_destinations, reviews, notifications. Also clear
  // rate_limits so re-seeding within 10 minutes doesn't trip the verify-otp throttle.
  const phoneDigits = ALL_PHONES().map((p) => p.replace(/^\+/, ''));
  const sql = `
    DELETE FROM public.rate_limits WHERE
      ${phoneDigits.map((d) => `bucket LIKE '%${d}%'`).join(' OR ')};
    DELETE FROM auth.users WHERE phone IN (${list}) OR id IN (
      SELECT id FROM public.users WHERE phone IN (${list})
    );
    DELETE FROM public.users WHERE phone IN (${list});
  `;
  console.log('[seed-qa] phase 1: wiping 8 phones …');
  const { status, text } = await runSql(sql);
  if (status !== 200 && status !== 201) {
    console.error(`[seed-qa] wipe failed (${status}): ${text}`);
    process.exit(1);
  }
  console.log('[seed-qa]   ✓ wiped');
}

// ── Phase 2 — create accounts ────────────────────────────────────────────
async function tokenFor(phone, role, displayName) {
  await call('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await call('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', role, display_name: displayName } });
  if (r.status !== 200 || !r.json?.data?.access_token) {
    throw new Error(`verify-otp failed for ${phone}: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return r.json.data.access_token;
}
async function adminToken() {
  // Spin up a fresh admin solely to PATCH KYC. Phone is outside the QA roster so it survives wipe.
  const phone = `+919000000999`;
  return tokenFor(phone, 'admin', 'Seed Admin');
}

async function createUsers(cityIdByName) {
  const adminTok = await adminToken();
  console.log('[seed-qa] phase 2: creating 8 accounts …');
  const result = [];
  for (const q of QAS) {
    // Agent
    const agentPhone = AGENT_PHONE(q);
    const agentTok = await tokenFor(agentPhone, 'trip_manager', q.agentName);
    const agentCreate = await call('POST', '/agents', {
      token: agentTok,
      body: { full_name: q.agentName, business_city_id: cityIdByName[q.currentCity] },
    });
    if (agentCreate.status !== 200 || !agentCreate.json?.data?.id) throw new Error(`agent profile failed for ${agentPhone}: ${JSON.stringify(agentCreate.json)}`);
    const agentId = agentCreate.json.data.id;
    const agentKyc = await call('PATCH', `/agents/${agentId}/kyc`, { token: adminTok, body: { kyc_status: 'approved', note: 'qa seed' } });
    if (agentKyc.status !== 200) throw new Error(`agent kyc failed for ${agentPhone}: ${JSON.stringify(agentKyc.json)}`);

    // Driver
    const driverPhone = DRIVER_PHONE(q);
    const driverTok = await tokenFor(driverPhone, 'driver', q.driverName);
    const driverCreate = await call('POST', '/drivers', {
      token: driverTok,
      body: { full_name: q.driverName, home_city_id: cityIdByName[q.currentCity] },
    });
    if (driverCreate.status !== 200 || !driverCreate.json?.data?.id) throw new Error(`driver profile failed for ${driverPhone}: ${JSON.stringify(driverCreate.json)}`);
    const driverId = driverCreate.json.data.id;
    const driverKyc = await call('PATCH', `/drivers/${driverId}/kyc`, { token: adminTok, body: { kyc_status: 'approved', note: 'qa seed' } });
    if (driverKyc.status !== 200) throw new Error(`driver kyc failed for ${driverPhone}: ${JSON.stringify(driverKyc.json)}`);

    console.log(`[seed-qa]   ✓ QA${q.idx}: ${q.agentName} (${agentPhone}) + ${q.driverName} (${driverPhone})`);
    result.push({ q, agentPhone, driverPhone, agentId, driverId, driverTok });
  }
  return result;
}

// ── Phase 3 — post vacancies (tomorrow + day-after) ──────────────────────
async function postVacancies(seeded, cityIdByName) {
  console.log('[seed-qa] phase 3: posting 8 vacancies (2 per driver) …');
  for (const s of seeded) {
    const { q, driverTok } = s;
    const dests = q.dests.map((c) => cityIdByName[c]);
    for (let i = 0; i < 2; i++) {
      const dayOffset = i + 1; // 1 = tomorrow, 2 = day-after
      const hour = q.hours[i];
      const from = atDayHour(dayOffset, hour);
      const until = atDayHour(dayOffset, hour + 8);
      const body = {
        current_city_id: cityIdByName[q.currentCity],
        destination_city_ids: [dests[i]],
        available_from: from,
        available_until: until,
        min_rate_per_km: 14,
        notes: `QA${q.idx} seed — ${q.currentCity} → ${q.dests[i]} (${dayOffset === 1 ? 'tomorrow' : 'day-after'})`,
      };
      const res = await call('POST', '/vacancies', { token: driverTok, body });
      if (res.status !== 200 || !res.json?.data?.id) {
        throw new Error(`vacancy ${dayOffset} failed for QA${q.idx}: ${JSON.stringify(res.json)}`);
      }
    }
    console.log(`[seed-qa]   ✓ QA${q.idx} (${q.driverName}): 2 vacancies posted`);
  }
}

// ── Phase 4 — summary ────────────────────────────────────────────────────
function printSummary() {
  console.log('\n' + '═'.repeat(80));
  console.log('QA seed complete — 8 accounts, 8 vacancies. OTP = 123456 for everyone.');
  console.log('═'.repeat(80));
  for (const q of QAS) {
    console.log(`QA${q.idx}  Agent  ${q.agentName.padEnd(14)} ${AGENT_PHONE(q)}`);
    console.log(`QA${q.idx}  Driver ${q.driverName.padEnd(14)} ${DRIVER_PHONE(q)}  · 2 vacancies: ${q.currentCity} → ${q.dests[0]} (tmrw ${String(q.hours[0]).padStart(2, '0')}:00), ${q.currentCity} → ${q.dests[1]} (day-after ${String(q.hours[1]).padStart(2, '0')}:00)`);
  }
  console.log('═'.repeat(80));
}

// ── orchestration ────────────────────────────────────────────────────────
(async () => {
  console.log(`[seed-qa] base = ${BASE}`);
  const cityRes = await call('GET', '/admin/cities');
  if (cityRes.status !== 200 || !Array.isArray(cityRes.json?.data)) {
    console.error(`[seed-qa] couldn't list cities (${cityRes.status})`);
    process.exit(1);
  }
  const cityIdByName = Object.fromEntries(cityRes.json.data.map((c) => [c.name, c.id]));
  for (const q of QAS) {
    if (!cityIdByName[q.currentCity]) {
      console.error(`[seed-qa] missing city in DB: ${q.currentCity}`);
      process.exit(1);
    }
    for (const d of q.dests) {
      if (!cityIdByName[d]) {
        console.error(`[seed-qa] missing city in DB: ${d}`);
        process.exit(1);
      }
    }
  }

  await wipe();
  const seeded = await createUsers(cityIdByName);
  await postVacancies(seeded, cityIdByName);
  printSummary();
})().catch((e) => {
  console.error('[seed-qa] error:', e.message || e);
  process.exit(1);
});
