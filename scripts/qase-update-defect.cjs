#!/usr/bin/env node
/**
 * Qase defect status updater — flips a defect's status (resolved | invalid) and
 * appends a reason note to `actual_result`. Used to close the loop on Qase-filed
 * defects once they're fixed, retested, or determined to be test-harness noise.
 *
 * The Qase v1 API doesn't expose a defect-comments endpoint, so the reason rides
 * along in `actual_result` (one line per update, prefixed with [STATUS yyyy-mm-dd]).
 * "Retest" is a test-result status (not a defect status), so we resolve + ask in
 * the reason instead.
 *
 * Usage:
 *   node scripts/qase-update-defect.cjs <id> resolve|invalid "Reason text"
 *
 * Env (read from .env.development at repo root if present, else process.env):
 *   QASE_API_TOKEN, QASE_PROJECT_CODE
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env.development'),
    path.resolve(__dirname, '..', '.env.development'),
    path.resolve(__dirname, '..', '..', '..', '..', '.env.development'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}
loadEnv();

const TOKEN = process.env.QASE_API_TOKEN;
const CODE = process.env.QASE_PROJECT_CODE;
if (!TOKEN || !CODE) {
  console.error('QASE_API_TOKEN and QASE_PROJECT_CODE must be set in env or .env.development');
  process.exit(2);
}

async function qase(method, urlPath, body) {
  const res = await fetch(`https://api.qase.io/v1${urlPath}`, {
    method,
    headers: { 'Token': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok && json?.status !== false, status: res.status, json };
}

async function getDefect(id) {
  const { json } = await qase('GET', `/defect/${CODE}/${id}`);
  return json?.result;
}

async function updateDefect(id, action, reason) {
  const existing = await getDefect(id);
  if (!existing) throw new Error(`Defect ${id} not found in ${CODE}`);
  const date = new Date().toISOString().slice(0, 10);
  const tag = action === 'invalid' ? 'INVALID' : 'RESOLVED';
  const note = `[${tag} ${date}] ${reason}`;
  const newActual = existing.actual_result && !existing.actual_result.includes(note)
    ? `${existing.actual_result}\n\n${note}`
    : (existing.actual_result || note);

  const patch = await qase('PATCH', `/defect/${CODE}/${id}`, { actual_result: newActual });
  if (!patch.ok) throw new Error(`PATCH actual_result failed: ${JSON.stringify(patch.json)}`);

  if (action === 'resolve') {
    if (existing.status === 'resolved') {
      console.log('(already resolved; skipping status flip)');
    } else {
      const flip = await qase('PATCH', `/defect/${CODE}/resolve/${id}`);
      if (!flip.ok) throw new Error(`PATCH resolve failed: ${JSON.stringify(flip.json)}`);
    }
  }
  return getDefect(id);
}

async function main() {
  const [, , idStr, action, ...rest] = process.argv;
  const reason = rest.join(' ').trim();
  if (!idStr || !action || !reason) {
    console.error('usage: qase-update-defect.cjs <id> resolve "reason"');
    process.exit(2);
  }
  const id = Number(idStr);
  if (!Number.isInteger(id)) { console.error('id must be an integer'); process.exit(2); }
  if (action !== 'resolve') { console.error('action must be resolve (Qase v1 has no other defect-status flip endpoint)'); process.exit(2); }

  const after = await updateDefect(id, action, reason);
  console.log(`D${id} → status=${after.status}  resolved_at=${after.resolved_at ?? '—'}`);
  console.log('actual_result:');
  console.log(after.actual_result);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
