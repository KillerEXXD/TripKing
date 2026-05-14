/**
 * vitest-axe@0.1.0 ships its type augmentation against `namespace Vi`, which
 * modern vitest typings don't expose. Re-declare against the current `vitest`
 * module so `expect(...).toHaveNoViolations()` typechecks.
 */
import 'vitest';
import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  interface Assertion<_T = unknown> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
