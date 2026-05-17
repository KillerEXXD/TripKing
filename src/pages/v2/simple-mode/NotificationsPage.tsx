import { Link } from 'react-router-dom';
import { ChevronLeft, Bell, CircleCheck, CircleAlert, MessageCircle } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { Notification } from '@/types';

/** v7 Simple Mode — notifications. Big icon + plain-language body. */
export function SimpleNotificationsPage() {
  const query = useNotifications({ limit: 20 });
  const items = query.data ?? [];

  return (
    <div className="flex min-h-dvh flex-col bg-page pb-6">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div>
          <div className="text-[22px] font-bold">Messages</div>
          <div className="text-[14px] text-muted-foreground">News for you</div>
        </div>
      </header>

      <main className="space-y-3 px-5">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Could not load. Try again." onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="Nothing new" message="Come back later." />
        ) : (
          items.map((n) => <NotificationRow key={n.id} n={n} />)
        )}
      </main>
    </div>
  );
}

function iconFor(t: Notification['type']) {
  switch (t) {
    case 'alert_match':     return { icon: <Bell className="size-8" />,          color: 'var(--skin-simple-wait)', bg: 'var(--skin-simple-wait-bg)' };
    case 'trip_assigned':   return { icon: <CircleCheck className="size-8" />,   color: 'var(--skin-simple-go)',   bg: 'var(--skin-simple-go-bg)'   };
    case 'trip_cancelled':  return { icon: <CircleAlert className="size-8" />,   color: 'var(--skin-simple-stop)', bg: 'var(--skin-simple-stop-bg)' };
    case 'trip_completed':  return { icon: <CircleCheck className="size-8" />,   color: 'var(--skin-simple-go)',   bg: 'var(--skin-simple-go-bg)'   };
    case 'review_received': return { icon: <MessageCircle className="size-8" />, color: 'var(--color-primary)',    bg: 'var(--color-surface-muted)' };
    default:                return { icon: <Bell className="size-8" />,          color: 'var(--color-muted-foreground)', bg: 'var(--color-surface-muted)' };
  }
}

function NotificationRow({ n }: { n: Notification }) {
  const t = iconFor(n.type);
  return (
    <article
      className={`flex items-start gap-3 rounded-card border-2 p-4 ${n.isRead ? 'opacity-70' : ''}`}
      style={{ borderColor: t.color, background: t.bg }}
    >
      <div style={{ color: t.color }}>{t.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[18px] font-bold leading-tight">{n.title}</div>
        <div className="mt-1 text-[15px] text-muted-foreground">{n.body}</div>
      </div>
    </article>
  );
}

export default SimpleNotificationsPage;
