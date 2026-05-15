import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';

interface QueueListPageProps<T> {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  isPending: boolean;
  isError: boolean;
  onRetry?: () => void;
  emptyTitle: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  backTo?: string;
}

/**
 * Generic queue list page used by the Home-tab work queues (agent in-progress,
 * agent needs-action, driver awaiting-decision). Back button + empty-bounce
 * both target `backTo` (default `/`) so the user always lands back on Home
 * once they've cleared the queue. The empty-bounce only fires *after* the
 * queue had at least one item — so an initial-empty load just shows the
 * empty state instead of insta-redirecting.
 */
export function QueueListPage<T>({
  title,
  subtitle,
  icon,
  items,
  getKey,
  renderItem,
  isPending,
  isError,
  onRetry,
  emptyTitle,
  emptyMessage,
  emptyAction,
  backTo = '/',
}: QueueListPageProps<T>) {
  const navigate = useNavigate();
  const sawItemsRef = useRef(false);
  useEffect(() => {
    if (isPending || isError) return;
    if (items.length > 0) {
      sawItemsRef.current = true;
      return;
    }
    if (sawItemsRef.current) {
      navigate(backTo, { replace: true });
    }
  }, [items.length, isPending, isError, navigate, backTo]);

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-3 border-b bg-white px-4 py-3">
        <button
          type="button"
          aria-label="Back to home"
          onClick={() => navigate(backTo)}
          className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h1 className="flex items-center gap-1.5 text-base font-semibold">
            {icon ? <span aria-hidden>{icon}</span> : null}
            {title}
          </h1>
          {subtitle ? <div className="truncate text-xs text-secondary">{subtitle}</div> : null}
        </div>
      </header>

      <div className="space-y-3 p-4">
        {isPending ? (
          <LoadingSkeleton rows={3} />
        ) : isError ? (
          <ErrorState
            title="Couldn't load this queue"
            message="Check your connection and try again."
            onRetry={onRetry}
          />
        ) : items.length === 0 ? (
          <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
        ) : (
          items.map((item) => <div key={getKey(item)}>{renderItem(item)}</div>)
        )}
      </div>
    </div>
  );
}

export default QueueListPage;
