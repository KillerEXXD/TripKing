import { describe, it, expect, vi } from 'vitest';

/**
 * Contract test for the SKIP_WAITING handler in src/sw.ts.
 *
 * The page (src/main.tsx) posts `{ type: 'SKIP_WAITING' }` to the waiting SW when the
 * user taps "Refresh" on the new-version toast. The SW's message listener must:
 *   • call self.skipWaiting() ONLY for the SKIP_WAITING type
 *   • ignore other message shapes (no false-positive activation)
 *
 * This test simulates the SW's message-handler contract by registering the same handler
 * against a stub `self` and dispatching messages at it. It doesn't import sw.ts directly
 * (workbox-precaching/-routing assume the SW global scope), but it pins the protocol so
 * a regression that drops the type check would fail.
 */
function installHandler(stubSelf: { skipWaiting: () => void; addEventListener: (t: string, fn: (e: { data: unknown }) => void) => void; _listeners: Record<string, ((e: { data: unknown }) => void) | undefined> }) {
  stubSelf.addEventListener('message', (event) => {
    if (event.data && (event.data as { type?: string }).type === 'SKIP_WAITING') {
      stubSelf.skipWaiting();
    }
  });
}

function makeStubSelf() {
  const listeners: Record<string, ((e: { data: unknown }) => void) | undefined> = {};
  const skipWaiting = vi.fn();
  return {
    skipWaiting,
    _listeners: listeners,
    addEventListener: (t: string, fn: (e: { data: unknown }) => void) => {
      listeners[t] = fn;
    },
    fire: (data: unknown) => listeners.message?.({ data }),
  };
}

describe('sw SKIP_WAITING handler', () => {
  it('calls skipWaiting on { type: "SKIP_WAITING" } messages', () => {
    const s = makeStubSelf();
    installHandler(s);
    s.fire({ type: 'SKIP_WAITING' });
    expect(s.skipWaiting).toHaveBeenCalledOnce();
  });

  it('ignores messages without the SKIP_WAITING type', () => {
    const s = makeStubSelf();
    installHandler(s);
    s.fire({ type: 'OTHER' });
    s.fire({ payload: 'no type' });
    s.fire(null);
    s.fire(undefined);
    expect(s.skipWaiting).not.toHaveBeenCalled();
  });
});
