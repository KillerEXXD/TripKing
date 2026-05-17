import { Link } from 'react-router-dom';
import { ChevronLeft, Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';

export function BharatNotificationsPage() {
  const query = useNotifications({ limit: 30 });
  const items = query.data ?? [];

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="bg-primary px-4 pb-5 pt-4 text-primary-foreground">
        <Link to="/v6" aria-label="Back" className="mb-3 inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <BilingualText as="h1" ta="அறிவிப்புகள்" en="Notifications" size="lg" />
      </header>
      <div className="space-y-3 p-4">
        {query.isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : query.isError ? (
          <ErrorState message="ஏற்ற முடியவில்லை · Couldn't load." onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="அறிவிப்புகள் இல்லை · No notifications" message="நீங்கள் தாமதமாக இருக்கிறீர்கள் — All caught up." />
        ) : (
          items.map((n) => (
            <article
              key={n.id}
              className={`flex items-start gap-3 rounded-card bg-surface p-4 shadow-card ${n.isRead ? 'opacity-70' : ''}`}
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary/10 text-primary">
                <Bell className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-tight">{n.title}</div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">{n.body}</div>
              </div>
              {!n.isRead ? (
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ background: 'var(--skin-bharat-vermilion)' }}
                  aria-label="Unread"
                />
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export default BharatNotificationsPage;
