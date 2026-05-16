#!/usr/bin/env node
/**
 * Post-deploy Cloudflare purge for the **apex** zone (`tripkingapp.com` browser app).
 *
 * Spec: docs/CLOUDFLARE_CACHE_RULES.md §"Apex purge". Purges the small set of
 * mutable surfaces — index.html / SW / manifest — while leaving content-hashed
 * `/assets/*` alone (those filenames change with every build, so old hashes just
 * stop being referenced and expire naturally at their long TTL).
 *
 * Run this after every Vercel deploy that changes index.html, the SW, or the
 * manifest. Until the apex flips to orange-cloud (still grey-cloud as of
 * 2026-05-16), the script is a no-op against Cloudflare's edge — there's nothing
 * cached there to purge. But running it is still safe and forward-compatible.
 *
 * Usage:
 *   npm run deploy:purge
 *
 *   # Or explicit:
 *   CLOUDFLARE_ZONE_ID=... CLOUDFLARE_PURGE_TOKEN=... node scripts/deploy-purge.cjs
 *
 *   # Custom domain (defaults to https://tripkingapp.com):
 *   node scripts/deploy-purge.cjs --domain https://staging.tripkingapp.com
 *
 *   # Dry run — print URLs without purging:
 *   node scripts/deploy-purge.cjs --dry-run
 *
 * Exits 0 on success, 1 on any failure. CI-safe.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Lightweight env loader (no dotenv dep — matches the qase-import pattern).
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.development');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv();

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const domainIdx = args.indexOf('--domain');
const DOMAIN = domainIdx >= 0 ? args[domainIdx + 1] : 'https://tripkingapp.com';

const TOKEN = process.env.CLOUDFLARE_PURGE_TOKEN;
const ZONE = process.env.CLOUDFLARE_ZONE_ID;

// Apex URLs to purge — see docs/CLOUDFLARE_CACHE_RULES.md §"Apex purge".
// /assets/* is intentionally absent: content-hashed filenames roll naturally.
const URLS = [
  `${DOMAIN}/`,
  `${DOMAIN}/index.html`,
  `${DOMAIN}/sw.js`,
  `${DOMAIN}/manifest.json`,
  `${DOMAIN}/registerSW.js`,
];

if (DRY) {
  console.log(`[deploy-purge] dry-run — would purge ${URLS.length} URL(s) on ${DOMAIN}:`);
  for (const u of URLS) console.log(`  ${u}`);
  process.exit(0);
}

if (!TOKEN || !ZONE) {
  console.error('[deploy-purge] CLOUDFLARE_PURGE_TOKEN and CLOUDFLARE_ZONE_ID must be set.');
  console.error('  Set them in .env.development (gitignored) or pass via env on the command line.');
  console.error('  Use --dry-run to inspect the URL list without purging.');
  process.exit(1);
}

async function main() {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ files: URLS }),
  });
  const txt = await res.text();
  let body;
  try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
  if (!res.ok || body?.success === false) {
    console.error(`[deploy-purge] failed: HTTP ${res.status}`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log(`[deploy-purge] purged ${URLS.length} URL(s) on ${DOMAIN}. Job id: ${body?.result?.id ?? '(unknown)'}`);
}

main().catch((err) => {
  console.error('[deploy-purge] unexpected error:', err?.message ?? err);
  process.exit(1);
});
