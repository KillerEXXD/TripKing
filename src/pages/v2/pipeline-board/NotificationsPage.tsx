import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';

export function PipelineNotificationsPage() {
  const query = useNotifications({ limit: 30 });
  const items = query.data ?? [];
  const unread = items.filter((n) => !n.isRead);
  const read = items.filter((n) => n.isRead);

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-3">
      <header className="flex items-center gap-2">
        <Link to="/v4" aria-label="Back" className="rounded-control p-1">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">Notifications</h1>
      </header>
      {query.isLoading ? (
        <div className="mt-3"><LoadingSkeleton rows={4} /></div>
      ) : query.isError ? (
        <div className="mt-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : items.length === 0 ? (
        <div className="mt-6"><EmptyState title="Inbox zero" message="Nothing to action." /></div>
      ) : (
        <>
          <Column title="Unread" tint="has_applicants" items={unread} />
          <Column title="Read" tint="completed" items={read} />
        </>
      )}
    </div>
  );
}

function Column({ title, tint, items }: { title: string; tint: string; items: { id: string; title: string; body: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section data-tint={tint} className="mt-4 rounded-card p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-medium">{items.length}</div>
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <article key={n.id} className="rounded-card bg-surface p-3 shadow-card">
            <div className="text-[14px] font-semibold">{n.title}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{n.body}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default PipelineNotificationsPage;
