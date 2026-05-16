/**
 * Tests for `installGlobalErrorHandlers` — specifically the stale-bootstrap
 * auto-recovery added 2026-05-16 after a deployed SW wedged on six users' tabs.
 *
 * The handler is a module-level singleton (`installed` flag). vitest's `resetModules`
 * is used between tests to force a fresh install per case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RELOAD_KEY = 'tk-stale-bootstrap-reload-at';

describe('installGlobalErrorHandlers — stale-bootstrap recovery', () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;
  let listeners: { error?: EventListener; rejection?: EventListener } = {};

  beforeEach(async () => {
    vi.resetModules();
    listeners = {};
    sessionStorage.clear();
    // Intercept addEventListener to grab the registered callbacks.
    const realAdd = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, fn: EventListener, opts?: unknown) => {
      if (type === 'error') listeners.error = fn;
      if (type === 'unhandledrejection') listeners.rejection = fn;
      realAdd(type, fn, opts as never);
    }) as typeof window.addEventListener);
    // JSDOM's window.location is non-configurable — replace the whole object so reload() is spy-able.
    originalLocation = window.location;
    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: originalLocation.origin, reload: reloadMock },
    });
    const mod = await import('@/lib/globalErrorHandlers');
    mod.installGlobalErrorHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  function fireScriptLoadError(url: string): void {
    const script = document.createElement('script');
    Object.defineProperty(script, 'src', { value: url });
    const evt = new Event('error') as ErrorEvent;
    Object.defineProperty(evt, 'target', { value: script });
    listeners.error?.(evt);
  }

  it('reloads when a same-origin /assets/*.js bootstrap chunk fails', () => {
    fireScriptLoadError(`${window.location.origin}/assets/vendor-react-BtujSJep.js`);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_KEY)).toMatch(/^\d+$/);
  });

  it('suppresses reload when a previous reload happened within 30s (loop guard)', () => {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now() - 1000)); // 1s ago
    fireScriptLoadError(`${window.location.origin}/assets/vendor-charts-Bqlfzel1.js`);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('reloads again once the loop-guard window has elapsed (> 30s)', () => {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now() - 31_000)); // 31s ago
    fireScriptLoadError(`${window.location.origin}/assets/vendor-ui-ClbnFt0_.js`);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload for cross-origin script errors (e.g. analytics/CDN)', () => {
    fireScriptLoadError('https://cdn.example.com/some-tracker.js');
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does NOT reload for non-asset paths on our origin', () => {
    fireScriptLoadError(`${window.location.origin}/some-other-script.js`);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does NOT reload for image / link element failures', () => {
    const img = document.createElement('img');
    Object.defineProperty(img, 'src', { value: `${window.location.origin}/assets/logo-abc.png` });
    const evt = new Event('error') as ErrorEvent;
    Object.defineProperty(evt, 'target', { value: img });
    listeners.error?.(evt);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
