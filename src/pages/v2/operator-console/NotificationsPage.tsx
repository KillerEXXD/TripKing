import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';

const TYPE_LABEL: Record<string, string> = {
  alert_match: 'ALERT',
  trip_assigned: 'TRIP',
  trip_cancelled: 'CANCEL',
  trip_completed: 'DONE',
  review_received: 'REVIEW',
  kyc_status_change: 'KYC',
};

export function OperatorNotificationsPage() {
  const query = useNotifications({ limit: 30 });
  const items = query.data ?? [];

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold">Notifications</span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
          {items.filter((n) => !n.isRead).length} unread
        </span>
      </header>
      {query.isLoading ? (
        <div className="p-3"><LoadingSkeleton rows={6} /></div>
      ) : query.isError ? (
        <div className="p-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : items.length === 0 ? (
        <div className="p-3"><EmptyState title="No notifications" message="You're all caught up." /></div>
      ) : (
        items.map((n) => (
          <div
            key={n.id}
            className={`grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-border px-3 py-2 text-[13px] ${n.isRead ? 'opacity-60' : ''}`}
          >
            <span className="rounded-control border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide">
              {TYPE_LABEL[n.type] ?? n.type.slice(0, 6).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{n.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">{n.body}</div>
            </div>
            {!n.isRead ? <span className="mt-1 size-2 rounded-full bg-amber-500" aria-label="Unread" /> : <span />}
          </div>
        ))
      )}
    </div>
  );
}

export default OperatorNotificationsPage;
