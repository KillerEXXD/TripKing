/**
 * Self-test for scripts/check-pii-public-scope.cjs. Runs the gate against a temp `supabase/functions`
 * tree where we inject (a) a clean public-scoped file and (b) a poisoned one, and asserts the gate
 * exits 0 / 1 respectively. Plus a (c) escape-hatch path.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const GATE = path.resolve(__dirname, '..', 'check-pii-public-scope.cjs');

function withSandbox(setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-gate-'));
  const fnRoot = path.join(dir, 'supabase', 'functions');
  fs.mkdirSync(fnRoot, { recursive: true });
  setup(fnRoot);
  return { dir, fnRoot };
}

function runGate(fnRoot, env = {}) {
  return spawnSync('node', [GATE], {
    env: { ...process.env, TRIPKING_PII_GATE_ROOT: fnRoot, ...env },
    encoding: 'utf8',
  });
}

test('passes when no file emits scope:public', () => {
  const { fnRoot } = withSandbox((fnRoot) => {
    fs.writeFileSync(path.join(fnRoot, 'a.ts'), 'export const x = 1;');
  });
  const r = runGate(fnRoot);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('passes when a public-scoped file has NO forbidden PII tokens (the vacancies / admin case)', () => {
  const { fnRoot } = withSandbox((fnRoot) => {
    fs.writeFileSync(
      path.join(fnRoot, 'cities.ts'),
      `setCacheControl(res, { ttl: 60, scope: 'public' });\nconst name = row.name;\n`,
    );
  });
  const r = runGate(fnRoot);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('fails when a public-scoped file mentions passenger_phone', () => {
  const { fnRoot } = withSandbox((fnRoot) => {
    fs.writeFileSync(
      path.join(fnRoot, 'bad.ts'),
      `setCacheControl(res, { ttl: 60, scope: 'public' });\nconst leak = row.passenger_phone;\n`,
    );
  });
  const r = runGate(fnRoot);
  assert.equal(r.status, 1, 'gate should reject passenger_phone in a scope:public file');
  assert.match(r.stderr + r.stdout, /passenger_phone/);
});

test('fails when a public-scoped file mentions aadhaar (covers aadhaar_url, aadhaar_number, ...)', () => {
  const { fnRoot } = withSandbox((fnRoot) => {
    fs.writeFileSync(
      path.join(fnRoot, 'bad2.ts'),
      `setCacheControl(res, { ttl: 60, scope: 'public' });\nconst doc = row.aadhaar_url;\n`,
    );
  });
  const r = runGate(fnRoot);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /aadhaar/);
});

test('passes when a PRIVATE-scoped file mentions PII (private-scope is safe)', () => {
  const { fnRoot } = withSandbox((fnRoot) => {
    fs.writeFileSync(
      path.join(fnRoot, 'private.ts'),
      `setCacheControl(res, { ttl: 60, scope: 'private' });\nconst leak = row.passenger_phone;\n`,
    );
  });
  const r = runGate(fnRoot);
  assert.equal(r.status, 0);
});

test('escape hatch TRIPKING_SKIP_PII_CACHE_GATE=1 bypasses the gate (with a warning)', () => {
  const { fnRoot } = withSandbox((fnRoot) => {
    fs.writeFileSync(
      path.join(fnRoot, 'bad.ts'),
      `setCacheControl(res, { ttl: 60, scope: 'public' });\nconst leak = row.passenger_phone;\n`,
    );
  });
  const r = runGate(fnRoot, { TRIPKING_SKIP_PII_CACHE_GATE: '1' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /SKIPPED/);
});
