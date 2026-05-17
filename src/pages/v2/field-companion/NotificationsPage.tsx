import { Link } from 'react-router-dom';
import { ChevronLeft, Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';

export function FieldNotificationsPage() {
  const query = useNotifications({ limit: 20 });
  const items = query.data ?? [];

  return (
    <div className="min-h-dvh pb-10">
      <header className="flex items-center gap-3 px-5 pt-4">
        <Link to="/v3" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[22px] font-bold">Notifications</h1>
      </header>
      <div className="mt-4 space-y-3 px-5">
        {query.isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : query.isError ? (
          <ErrorState message="Couldn't load." onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="All quiet" message="No new notifications." />
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-card bg-surface p-4 shadow-card ${n.isRead ? 'opacity-70' : ''}`}
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary/15 text-primary">
                <Bell className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold leading-tight">{n.title}</div>
                <div className="mt-1 text-[14px] text-muted-foreground">{n.body}</div>
              </div>
              {!n.isRead ? <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default FieldNotificationsPage;
