#!/usr/bin/env node
/**
 * Pre-push gate — blocks pushes that modify source under `src/` without a
 * corresponding `__tests__/` change in the same commit range.
 *
 * Enforces `docs/TEST_POLICY.md`. Escape hatch: `TRIPKING_SKIP_TEST_GATE=1`
 * (intended for docs/comment/type-only changes — using it on a feature or
 * bugfix is a policy violation and PR reviewers reject those).
 *
 *   Diff range: `origin/main..HEAD` (the commits this push would publish).
 *   Counted-as-test: any path containing `__tests__/`.
 *   Counted-as-source: any `src/**\/*.{ts,tsx}` NOT in `__tests__/`, excluding
 *     `src/types/**`, `src/components/ui/**`, `src/main.tsx`, `src/version.ts`,
 *     `src/test/**`, and `.d.ts` files (same exclusions as vitest coverage.include).
 */
const { execSync } = require('node:child_process');

if (process.env.TRIPKING_SKIP_TEST_GATE === '1') {
  console.log('⚠️  test-required gate SKIPPED via TRIPKING_SKIP_TEST_GATE=1');
  process.exit(0);
}

function changedFiles() {
  try {
    const out = execSync('git diff --name-only --diff-filter=ACMR origin/main...HEAD', { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const EXCLUDE_RE = /^src\/(types\/|components\/ui\/|main\.tsx$|version\.ts$|test\/|vite-env\.d\.ts$)|\.d\.ts$/;

function classify(files) {
  const src = [];
  const tests = [];
  for (const f of files) {
    if (!f.startsWith('src/')) continue;
    if (!/\.(ts|tsx)$/.test(f)) continue;
    if (f.includes('__tests__/')) {
      tests.push(f);
      continue;
    }
    if (EXCLUDE_RE.test(f)) continue;
    src.push(f);
  }
  return { src, tests };
}

const files = changedFiles();
const { src, tests } = classify(files);

if (src.length === 0) {
  process.exit(0);
}

if (tests.length === 0) {
  console.error('');
  console.error('❌  TEST POLICY VIOLATION');
  console.error('');
  console.error('   You changed', src.length, 'source file(s) under src/ without any __tests__/ change:');
  for (const f of src.slice(0, 10)) console.error('     -', f);
  if (src.length > 10) console.error('     … and', src.length - 10, 'more');
  console.error('');
  console.error('   docs/TEST_POLICY.md requires tests in the SAME commit as the code.');
  console.error('   Write the test, then push again.');
  console.error('');
  console.error('   Escape hatch (docs/refactor/types only — NOT for features/bugfixes):');
  console.error('     TRIPKING_SKIP_TEST_GATE=1 git push');
  console.error('');
  process.exit(1);
}

console.log(`✅  test-required gate: ${src.length} source file(s) changed, ${tests.length} test file(s) changed`);
process.exit(0);
