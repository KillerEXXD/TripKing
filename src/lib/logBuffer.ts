/* eslint-disable no-console -- this file deliberately wraps the console API. */
/**
 * Console log ring buffer for the bug-reporter.
 *
 * Captures up to 50 entries from the last 30 minutes by wrapping the native
 * console methods. Install once at bootstrap via `installConsoleHook()`.
 * Read snapshots with `getLogBuffer()` or the formatted `formatLogBuffer()`.
 */

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  /** ms since epoch. */
  ts: number;
  level: LogLevel;
  /** Stringified args, truncated. */
  message: string;
}

const MAX_ENTRIES = 50;
const MAX_AGE_MS = 30 * 60_000;
const MAX_MESSAGE_LEN = 4_000;

const buffer: LogEntry[] = [];
let installed = false;

function stringify(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return '[unserializable]';
  }
}

function append(level: LogLevel, args: unknown[]): void {
  const message = args.map(stringify).join(' ').slice(0, MAX_MESSAGE_LEN);
  buffer.push({ ts: Date.now(), level, message });
  // ring: drop the oldest if we've exceeded MAX_ENTRIES
  while (buffer.length > MAX_ENTRIES) buffer.shift();
}

/** Wrap the native console methods. Idempotent — safe to call multiple times. */
export function installConsoleHook(): void {
  if (installed || typeof console === 'undefined') return;
  installed = true;
  const levels: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  for (const level of levels) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = ((...args: unknown[]) => {
      try {
        append(level, args);
      } catch {
        // swallow — never break the host console
      }
      original(...args);
    }) as typeof console.log;
  }
}

/** Returns a fresh array of buffer entries newer than MAX_AGE_MS. */
export function getLogBuffer(): LogEntry[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return buffer.filter((e) => e.ts >= cutoff).slice(-MAX_ENTRIES);
}

/** Pretty multi-line dump for the bug-report payload (`console_logs` field). */
export function formatLogBuffer(): string {
  return getLogBuffer()
    .map((e) => `[${new Date(e.ts).toISOString()}] ${e.level.toUpperCase()} ${e.message}`)
    .join('\n');
}

/** Test helper — empties the buffer. */
export function __clearLogBufferForTests(): void {
  buffer.length = 0;
}
