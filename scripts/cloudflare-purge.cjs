#!/usr/bin/env node
/**
 * Purge Cloudflare's edge cache for one or more API URLs.
 *
 *   CLOUDFLARE_PURGE_TOKEN=... CLOUDFLARE_ZONE_ID=... \
 *     node scripts/cloudflare-purge.cjs \
 *       https://api.tripkingapp.com/functions/v1/admin/car-types \
 *       https://api.tripkingapp.com/functions/v1/admin/cities
 *
 *   # Or purge everything (use sparingly — full purges cost more on paid plans):
 *   node scripts/cloudflare-purge.cjs --all
 *
 * Required env (or shell prompt for them):
 *   CLOUDFLARE_PURGE_TOKEN — Cloudflare API token scoped to Zone.Cache Purge on tripkingapp.com.
 *   CLOUDFLARE_ZONE_ID    — the zone id (Cloudflare → Overview → API → Zone ID).
 *
 * Exit code: 0 on success, 1 on any failure.
 */

const TOKEN = process.env.CLOUDFLARE_PURGE_TOKEN;
const ZONE = process.env.CLOUDFLARE_ZONE_ID;

if (!TOKEN || !ZONE) {
  console.error('CLOUDFLARE_PURGE_TOKEN and CLOUDFLARE_ZONE_ID must be set.');
  console.error('Set them as Supabase function secrets for runtime invalidation; pass them on the');
  console.error('command line via env for ad-hoc purges from your shell.');
  process.exit(1);
}

const args = process.argv.slice(2);
const purgeAll = args.includes('--all');
const urls = args.filter((a) => a !== '--all');

if (!purgeAll && urls.length === 0) {
  console.error('Usage:');
  console.error('  node scripts/cloudflare-purge.cjs <url> [<url>...]');
  console.error('  node scripts/cloudflare-purge.cjs --all');
  process.exit(1);
}

const body = purgeAll ? { purge_everything: true } : { files: urls };

(async () => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ raw: 'non-JSON response' }));
  if (!res.ok || json?.success === false) {
    console.error(`Purge failed: ${res.status}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log(`Purged ${purgeAll ? 'everything' : urls.length + ' URL(s)'} — ${json.result?.id ?? 'ok'}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
