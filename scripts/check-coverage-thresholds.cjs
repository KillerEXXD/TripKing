#!/usr/bin/env node
/**
 * Coverage gate that dedupes Windows-path-case duplicates before checking thresholds.
 *
 * The v8 provider records the same source file under both `c:\…` and `C:\…` on
 * Windows (Node's cwd is uppercase, but some import-graph entries resolve through
 * lowercase). Half the rows show as 0% which halves the reported percentages
 * (e.g. 83% vs the real ~87%). vitest's own `coverage.thresholds` check sees the
 * raw, duplicated data and fails the build. This script reads coverage-final.json,
 * merges duplicate (case-insensitive path) entries by max-merging hit counts, then
 * checks the thresholds itself.
 */
const fs = require('node:fs');
const path = require('node:path');

const REPORT = path.resolve(__dirname, '..', 'coverage', 'coverage-final.json');
const THRESHOLDS = { lines: 85, statements: 85, functions: 69, branches: 71 };

if (!fs.existsSync(REPORT)) {
  console.error(`❌ ${REPORT} not found — run \`npm run test:coverage\` first.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

const merged = new Map();
for (const [key, file] of Object.entries(raw)) {
  const norm = key.replace(/\\/g, '/').toLowerCase();
  const existing = merged.get(norm);
  if (!existing) {
    merged.set(norm, file);
    continue;
  }
  for (const counter of ['s', 'f']) {
    for (const idx of Object.keys(existing[counter] ?? {})) {
      existing[counter][idx] = Math.max(existing[counter][idx] ?? 0, file[counter]?.[idx] ?? 0);
    }
  }
  for (const idx of Object.keys(existing.b ?? {})) {
    const a = existing.b[idx] ?? [];
    const b = file.b?.[idx] ?? [];
    existing.b[idx] = a.map((v, i) => Math.max(v ?? 0, b[i] ?? 0));
  }
}

let stmTotal = 0, stmCov = 0;
let fnTotal = 0, fnCov = 0;
let brTotal = 0, brCov = 0;
for (const file of merged.values()) {
  for (const hits of Object.values(file.s ?? {})) {
    stmTotal++; if (hits > 0) stmCov++;
  }
  for (const hits of Object.values(file.f ?? {})) {
    fnTotal++; if (hits > 0) fnCov++;
  }
  for (const arms of Object.values(file.b ?? {})) {
    for (const hits of arms) {
      brTotal++; if (hits > 0) brCov++;
    }
  }
}

const pct = (n, d) => (d === 0 ? 100 : (n / d) * 100);
const stmPct = pct(stmCov, stmTotal);
const fnPct = pct(fnCov, fnTotal);
const brPct = pct(brCov, brTotal);
const linesPct = stmPct;

const fmt = (p) => p.toFixed(2) + '%';
console.log(`Coverage (deduped from ${Object.keys(raw).length} → ${merged.size} files):`);
console.log(`  statements  ${fmt(stmPct)}  (${stmCov}/${stmTotal})  threshold ${THRESHOLDS.statements}%`);
console.log(`  lines       ${fmt(linesPct)}  (${stmCov}/${stmTotal})  threshold ${THRESHOLDS.lines}%`);
console.log(`  functions   ${fmt(fnPct)}  (${fnCov}/${fnTotal})  threshold ${THRESHOLDS.functions}%`);
console.log(`  branches    ${fmt(brPct)}  (${brCov}/${brTotal})  threshold ${THRESHOLDS.branches}%`);

const failures = [];
if (stmPct < THRESHOLDS.statements) failures.push(`statements ${fmt(stmPct)} < ${THRESHOLDS.statements}%`);
if (linesPct < THRESHOLDS.lines) failures.push(`lines ${fmt(linesPct)} < ${THRESHOLDS.lines}%`);
if (fnPct < THRESHOLDS.functions) failures.push(`functions ${fmt(fnPct)} < ${THRESHOLDS.functions}%`);
if (brPct < THRESHOLDS.branches) failures.push(`branches ${fmt(brPct)} < ${THRESHOLDS.branches}%`);

if (failures.length) {
  console.error('\n❌ Coverage below thresholds:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n✅ Coverage thresholds met.');
