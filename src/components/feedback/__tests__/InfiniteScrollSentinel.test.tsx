import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfiniteScrollSentinel } from '@/components/feedback/InfiniteScrollSentinel';

// JSDOM lacks IntersectionObserver. Stub it so the component can call observe/disconnect
// without crashing, and so we can trigger the intersection callback synchronously from tests.
let lastObserver: { trigger: (isIntersecting: boolean) => void; disconnect: () => void; observe: () => void; unobserve: () => void } | null = null;
class FakeIO {
  cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    lastObserver = {
      observe: () => {},
      unobserve: () => {},
      disconnect: () => {},
      trigger: (isIntersecting: boolean) => this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
    };
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeIO);
  lastObserver = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InfiniteScrollSentinel', () => {
  it('renders nothing when hasMore is false', () => {
    const onLoadMore = vi.fn();
    const { container } = render(<InfiniteScrollSentinel hasMore={false} loading={false} onLoadMore={onLoadMore} />);
    expect(container.firstChild).toBeNull();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('calls onLoadMore when the sentinel intersects the viewport', () => {
    const onLoadMore = vi.fn();
    render(<InfiniteScrollSentinel hasMore={true} loading={false} onLoadMore={onLoadMore} />);
    expect(lastObserver).not.toBeNull();
    lastObserver?.trigger(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not call onLoadMore while already loading (the observer is skipped)', () => {
    const onLoadMore = vi.fn();
    render(<InfiniteScrollSentinel hasMore={true} loading={true} onLoadMore={onLoadMore} />);
    // The observer is only attached when !loading, so even if the sentinel is in viewport
    // the user's onLoadMore stays uncalled. Guards against double-fetching while a request
    // is in flight.
    expect(lastObserver).toBeNull();
    expect(screen.getByRole('status', { name: /loading more/i })).toBeInTheDocument();
  });

  it('does not call onLoadMore when the sentinel scrolls out of view (isIntersecting=false)', () => {
    const onLoadMore = vi.fn();
    render(<InfiniteScrollSentinel hasMore={true} loading={false} onLoadMore={onLoadMore} />);
    lastObserver?.trigger(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
