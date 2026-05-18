import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Tiny div pinned to the bottom of a paginated list. Uses an IntersectionObserver
 * to call `onLoadMore` the moment it enters the viewport — i.e. when the user
 * scrolls within ~200px of the end of the rendered list.
 *
 * Pair with `useInfiniteQuery`:
 *
 *   <InfiniteScrollSentinel
 *     hasMore={query.hasNextPage}
 *     loading={query.isFetchingNextPage}
 *     onLoadMore={() => void query.fetchNextPage()}
 *   />
 *
 * Renders a small spinner while fetching; nothing once the list is exhausted. The
 * onLoadMore prop is read via a ref so callers don't need to memoise it.
 */
export function InfiniteScrollSentinel({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = '0px 0px 200px 0px',
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** How far below the viewport the sentinel should trigger from. Default 200px below. */
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Hold `onLoadMore` in a ref so the observer doesn't re-create on every render
  // when the parent passes an inline arrow. Otherwise pagination can stutter.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore || loading) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMoreRef.current();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, rootMargin]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex items-center justify-center py-4" aria-hidden={!loading}>
      {loading ? (
        <span className="inline-flex items-center gap-2 text-xs text-secondary" role="status" aria-label="Loading more">
          <Loader2 className="size-4 animate-spin" /> Loading more…
        </span>
      ) : null}
    </div>
  );
}

export default InfiniteScrollSentinel;
