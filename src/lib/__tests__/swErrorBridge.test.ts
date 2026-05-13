import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
import * as Sentry from '@sentry/react';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() } }));
import { logger } from '@/lib/logger';

import { installSwErrorBridge, __resetSwErrorBridgeForTests } from '@/lib/swErrorBridge';

// jsdom doesn't define `navigator.serviceWorker`. We attach a stub via
// `Object.defineProperty` so the bridge sees one and we can fire `message`
// events at it. (Each test resets the stub via `cleanupStub`.)
type Listener = (event: { data: unknown }) => void;
function stubServiceWorker(): { post: (data: unknown) => void; cleanup: () => void } {
  const listeners: Listener[] = [];
  const stub = {
    addEventListener: (_t: string, fn: Listener) => { listeners.push(fn); },
    removeEventListener: () => undefined,
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: stub,
    configurable: true,
    writable: true,
  });
  return {
    post: (data: unknown) => {
      for (const fn of listeners) fn({ data });
    },
    cleanup: () => {
      // delete the property so other tests / 'no SW' tests see a missing key
      // (jsdom's navigator allows redefinition).
      try {
        delete (navigator as unknown as Record<string, unknown>).serviceWorker;
      } catch {
        Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
      }
    },
  };
}

describe('installSwErrorBridge', () => {
  let bus: ReturnType<typeof stubServiceWorker> | null = null;

  beforeEach(() => {
    __resetSwErrorBridgeForTests();
    vi.mocked(Sentry.captureException).mockReset();
    vi.mocked(logger.warn).mockReset();
  });
  afterEach(() => {
    bus?.cleanup();
    bus = null;
  });

  it('captures a normal sw error message and tags it source:service-worker', () => {
    bus = stubServiceWorker();
    installSwErrorBridge();
    bus.post({
      type: 'sw-error',
      kind: 'error',
      message: 'precache failed for index.html',
      stack: 'Error: precache failed\n    at sw.js:66:110',
      url: 'sw.js',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('[sw] precache failed for index.html');
    expect((err as Error).stack).toContain('sw.js:66:110');
    expect(ctx).toEqual({
      tags: { source: 'service-worker', kind: 'error' },
      extra: { swUrl: 'sw.js' },
    });
  });

  it('captures an unhandledrejection with the correct kind tag', () => {
    bus = stubServiceWorker();
    installSwErrorBridge();
    bus.post({ type: 'sw-error', kind: 'unhandledrejection', message: 'fetch aborted' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [, ctx] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect((ctx as { tags: { kind: string } }).tags.kind).toBe('unhandledrejection');
  });

  it('ignores messages that are not sw-error payloads', () => {
    bus = stubServiceWorker();
    installSwErrorBridge();
    bus.post({ type: 'other', message: 'hello' });
    bus.post(null);
    bus.post('a string');
    bus.post({ type: 'sw-error', kind: 'bad-kind', message: 'no good' });
    bus.post({ type: 'sw-error', kind: 'error' }); // missing message
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('rate-limits to 10 reports per session and warns once', () => {
    bus = stubServiceWorker();
    installSwErrorBridge();
    for (let i = 0; i < 15; i++) {
      bus.post({ type: 'sw-error', kind: 'error', message: `err ${i}` });
    }
    expect(Sentry.captureException).toHaveBeenCalledTimes(10);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('rate limit'));
  });

  it('no-ops when serviceWorker is not in navigator', () => {
    // No stub installed.
    installSwErrorBridge();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    // Calling again is idempotent (no throw).
    installSwErrorBridge();
  });

  it('installs only once per session even if called multiple times', () => {
    bus = stubServiceWorker();
    installSwErrorBridge();
    installSwErrorBridge();
    installSwErrorBridge();
    bus.post({ type: 'sw-error', kind: 'error', message: 'one' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
