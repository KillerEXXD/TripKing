import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Bell, BellRing, Bug, CheckCircle2, Mail, MessageSquare, ShieldOff, Star, ThumbsDown, ThumbsUp, UserCheck, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/useNotifications';
import { useDecideVacancyInvitation } from '@/hooks/useVacancyInvitations';
import { Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { Notification, NotificationType } from '@/types';

const ICON: Record<NotificationType, LucideIcon> = {
  alert_match: BellRing,
  kyc_status_change: BadgeCheck,
  trip_assigned: UserCheck,
  trip_cancelled: XCircle,
  trip_completed: CheckCircle2,
  review_received: Star,
  account_status_change: ShieldOff,
  trip_invitation: Mail,
  invitation_accepted: ThumbsUp,
  invitation_declined: ThumbsDown,
  bug_reported: Bug,
  bug_resolved: Wrench,
  bug_commented: MessageSquare,
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** A trip-id payload, if this notification points at a trip. */
function tripIdOf(n: Notification): string | undefined {
  const v = n.payloadJson?.trip_id ?? n.payloadJson?.tripId;
  return typeof v === 'string' && v ? v : undefined;
}
/** An invitation-id payload, if this is a trip_invitation. */
function invitationIdOf(n: Notification): string | undefined {
  const v = n.payloadJson?.invitation_id ?? n.payloadJson?.invitationId;
  return typeof v === 'string' && v ? v : undefined;
}

function NotificationRow({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  const Icon = ICON[n.type] ?? Bell;
  const tripId = tripIdOf(n);
  const invitationId = n.type === 'trip_invitation' ? invitationIdOf(n) : undefined;
  const decide = useDecideVacancyInvitation();
  const handleDecide = (status: 'accepted' | 'declined') => {
    if (!invitationId) return;
    decide.mutate(
      { id: invitationId, status },
      {
        onSuccess: () => {
          toast.success(status === 'accepted' ? 'Invitation accepted — you can now see the trip details.' : 'Invitation declined.');
          if (!n.isRead) onRead(n.id);
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not update the invitation'),
      },
    );
  };
  return (
    <Card className={`gap-2 ${n.isRead ? '' : 'border-primary/40 bg-primary/5'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${n.isRead ? 'bg-muted text-secondary' : 'bg-primary/15 text-primary'}`} aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{n.title}</span>
            {n.isRead ? null : <span role="img" aria-label="Unread" className="size-2 shrink-0 rounded-full bg-primary" />}
          </div>
          {n.body ? <p className="mt-0.5 text-sm text-secondary">{n.body}</p> : null}
          {invitationId ? (
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" disabled={decide.isPending} onClick={() => handleDecide('accepted')}>
                <ThumbsUp className="size-3.5" aria-hidden /> Accept
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={decide.isPending} onClick={() => handleDecide('declined')}>
                <ThumbsDown className="size-3.5" aria-hidden /> Decline
              </Button>
            </div>
          ) : null}
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            <span className="text-secondary">{relTime(n.createdAt)}</span>
            {tripId ? (
              <Link to={`/trips/${tripId}`} className="font-medium text-primary underline" onClick={() => (n.isRead ? undefined : onRead(n.id))}>
                View trip
              </Link>
            ) : null}
            {n.isRead ? null : (
              <button type="button" className="text-secondary underline" onClick={() => onRead(n.id)}>
                Mark read
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * `/notifications` — the in-app inbox: alert matches, KYC updates, trip
 * assigned/completed/cancelled, reviews received. Unread items are highlighted;
 * tapping "Mark read" / "Mark all read" calls `useMarkNotificationRead` /
 * `useMarkAllNotificationsRead` (the unread badge elsewhere reflects the change).
 */
export function NotificationsPage() {
  const notifsQuery = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const notifs = notifsQuery.data ?? [];
  const unread = notifs.filter((n) => !n.isRead).length;

  // Returns to the previous page; falls back to / if history is empty (e.g. user opened the link directly).
  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <button type="button" onClick={goBack} className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </button>
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-sm text-secondary">{notifsQuery.isSuccess ? (unread > 0 ? `${unread} unread` : 'All caught up') : 'Your in-app inbox'}</p>
        </div>
        <Button variant="outline" size="sm" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
          {markAll.isPending ? 'Marking…' : 'Mark all read'}
        </Button>
      </header>

      {notifsQuery.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : notifsQuery.isError ? (
        <ErrorState title="Couldn't load notifications" message="Check your connection and try again." onRetry={() => void notifsQuery.refetch()} />
      ) : notifs.length === 0 ? (
        <EmptyState icon={<Bell className="size-7" />} title="No notifications yet" message="Trip updates, alert matches and reviews will show up here." />
      ) : (
        <div className="space-y-3">
          {notifs.map((n) => (
            <NotificationRow key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />
          ))}
        </div>
      )}
    </main>
  );
}

export default NotificationsPage;
