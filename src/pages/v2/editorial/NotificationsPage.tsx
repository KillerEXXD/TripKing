import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';

export function EditorialNotificationsPage() {
  const query = useNotifications({ limit: 30 });
  const items = query.data ?? [];

  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <Link
        to="/v5"
        aria-label="Back"
        className="m-3 -ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"
      >
        <ArrowLeft className="size-3" /> the journal
      </Link>
      <header className="border-b-2 border-foreground/80 pb-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">The bulletin</div>
        <h1 className="editorial-headline mt-2 text-[34px] leading-tight">Dispatches</h1>
      </header>
      {query.isLoading ? (
        <div className="pt-6"><LoadingSkeleton rows={4} /></div>
      ) : query.isError ? (
        <div className="pt-6"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : items.length === 0 ? (
        <div className="pt-6"><EmptyState title="No dispatches" message="The wire is quiet." /></div>
      ) : (
        <ul className="divide-y divide-border pt-2">
          {items.map((n) => (
            <li key={n.id} className={`py-5 ${n.isRead ? 'opacity-60' : ''}`}>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{n.type.replace(/_/g, ' ')}</div>
              <h2 className="editorial-headline mt-1 text-[20px] leading-tight">{n.title}</h2>
              <p className="mt-2 text-[13px] italic text-muted-foreground">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EditorialNotificationsPage;
