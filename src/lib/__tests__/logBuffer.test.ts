/* eslint-disable no-console -- this test deliberately exercises console wrapping. */
import { describe, it, expect, beforeEach } from 'vitest';
import { __clearLogBufferForTests, formatLogBuffer, getLogBuffer, installConsoleHook } from '@/lib/logBuffer';

// Install the hook once for this test file. Subsequent installs are no-ops.
installConsoleHook();

beforeEach(() => __clearLogBufferForTests());

describe('logBuffer', () => {
  it('captures entries from each log level', () => {
    console.log('a', 1);
    console.warn('w');
    console.error(new Error('boom'));
    const entries = getLogBuffer();
    expect(entries.some((e) => e.level === 'log' && e.message.includes('a 1'))).toBe(true);
    expect(entries.some((e) => e.level === 'warn' && e.message === 'w')).toBe(true);
    expect(entries.some((e) => e.message.includes('Error: boom'))).toBe(true);
  });

  it('caps at 50 entries (ring behaviour)', () => {
    for (let i = 0; i < 120; i++) console.log('msg', i);
    expect(getLogBuffer().length).toBe(50);
  });

  it('formatLogBuffer renders ISO timestamps + LEVEL', () => {
    console.log('hello-buf');
    const txt = formatLogBuffer();
    expect(txt).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    expect(txt).toMatch(/LOG .*hello-buf/);
  });

  it('installConsoleHook is idempotent', () => {
    installConsoleHook();
    installConsoleHook();
    expect(() => console.log('still ok')).not.toThrow();
  });
});
