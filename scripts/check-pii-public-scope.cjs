#!/usr/bin/env node
/**
 * Pre-push gate — item 10 of issue #114.
 *
 * Forbids any edge function from returning a response with `setCacheControl(..., { scope: 'public' })`
 * when the same file mentions a known PII-bearing field name. A public-scoped response can be cached
 * by Cloudflare or any intermediate proxy, so leaking PII into one would cross-contaminate users.
 *
 * Heuristic (file-level): if a file contains `scope: 'public'`, none of the FORBIDDEN_TOKENS may
 * appear anywhere in that file. The audit at 2026-05-15 (#114 item 10) confirmed every current
 * `scope: 'public'` file is clean — vacancies redacts driver PII via `redactDriver`, and admin
 * lookups (cities, car_types, etc.) carry no PII at all. This gate keeps it that way.
 *
 * Escape hatch: `TRIPKING_SKIP_PII_CACHE_GATE=1`. Use ONLY when shipping a deliberately-public
 * response that has been audited line-by-line (e.g. you've added a custom redaction wrapper).
 *
 * Exit 0 = clean / 1 = violation found / 1 = escape-hatch used (warning printed but pass).
 */
const fs = require('node:fs');
const path = require('node:path');

// Default scans the real edge-fn tree; the self-test overrides via TRIPKING_PII_GATE_ROOT.
const ROOT = process.env.TRIPKING_PII_GATE_ROOT
  ? path.resolve(process.env.TRIPKING_PII_GATE_ROOT)
  : path.resolve(__dirname, '..', 'supabase', 'functions');

// Tokens that MUST NOT appear in a file that emits scope: 'public'. Picked from the audit:
// `phone`/`email` alone are too generic (appear in input bodies, redact arg lists, etc.) — these
// are response-shape-specific PII field names. Add more on the same principle if new ones surface.
const FORBIDDEN_TOKENS = [
  'passenger_phone',
  'passenger_otp',        // covers passenger_otp AND passenger_otp_hash
  'posted_by_phone',
  'aadhaar',              // covers aadhaar_url, aadhaar_number, etc.
  'dl_number',
  'driver_license',
];

const PUBLIC_SCOPE_RE = /scope\s*:\s*['"]public['"]/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && full.endsWith('.ts')) yield full;
  }
}

if (process.env.TRIPKING_SKIP_PII_CACHE_GATE === '1') {
  console.log('⚠️  PII / public-scope gate SKIPPED via TRIPKING_SKIP_PII_CACHE_GATE=1');
  process.exit(0);
}

const violations = [];
let scanned = 0;
let publicScoped = 0;

for (const file of walk(ROOT)) {
  scanned += 1;
  const src = fs.readFileSync(file, 'utf8');
  if (!PUBLIC_SCOPE_RE.test(src)) continue;
  publicScoped += 1;

  const lines = src.split(/\r?\n/);
  for (const token of FORBIDDEN_TOKENS) {
    lines.forEach((line, idx) => {
      if (line.includes(token)) {
        violations.push({ file: path.relative(process.cwd(), file), line: idx + 1, token, snippet: line.trim() });
      }
    });
  }
}

if (violations.length > 0) {
  console.error('\n❌ PII / public-scope gate FAILED — these files emit scope:\'public\' AND mention a PII field name:\n');
  for (const v of violations) {
    console.error(`   ${v.file}:${v.line}  [${v.token}]`);
    console.error(`     ${v.snippet}`);
  }
  console.error('\n   A public-scoped response is cacheable by Cloudflare / any intermediary, so PII in it');
  console.error('   would cross-contaminate users. Either:');
  console.error('     1. Switch the response to scope:\'private\', OR');
  console.error('     2. Remove the PII reference from the file (e.g. redact before the response), OR');
  console.error('     3. If the PII reference is genuinely safe (e.g. a comment, a variable name in an');
  console.error('        unrelated handler), refactor so it does not literally appear in the file.');
  console.error('\n   Escape hatch (audit line-by-line first):  TRIPKING_SKIP_PII_CACHE_GATE=1 git push\n');
  process.exit(1);
}

console.log(`✅ PII / public-scope gate clean (${publicScoped} public-scoped file(s) / ${scanned} edge-fn files scanned)`);
process.exit(0);
