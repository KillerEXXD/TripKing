import { Link } from 'react-router-dom';
import { ChevronLeft, CircleCheck, CircleAlert, Clock } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { MyApplication } from '@/types';

/** v7 Simple Mode — my trips. Big status icon, plain status, big payout. */
export function SimpleMyTripsPage() {
  const query = useMyApplications();
  const apps = query.data ?? [];

  return (
    <div className="flex min-h-dvh flex-col bg-page pb-6">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div>
          <div className="text-[22px] font-bold">My trips</div>
          <div className="text-[14px] text-muted-foreground">Trips you said yes to</div>
        </div>
      </header>

      <main className="space-y-3 px-5">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Could not load. Try again." onRetry={() => query.refetch()} />
        ) : apps.length === 0 ? (
          <EmptyState title="No trips yet" message="Find a trip from the home screen." />
        ) : (
          apps.map((a) => <Row key={a.acceptanceId} app={a} />)
        )}
      </main>
    </div>
  );
}

function statusFor(s: MyApplication['status']): { icon: React.ReactNode; color: string; bg: string; label: string; hint: string } {
  switch (s) {
    case 'accepted':
      return { icon: <CircleCheck className="size-10" />, color: 'var(--skin-simple-go)',   bg: 'var(--skin-simple-go-bg)',   label: 'Confirmed', hint: 'Drive this one' };
    case 'selected':
      return { icon: <CircleAlert className="size-10" />, color: 'var(--skin-simple-wait)', bg: 'var(--skin-simple-wait-bg)', label: 'Action needed', hint: 'Tap to confirm' };
    case 'applied':
      return { icon: <Clock className="size-10" />,       color: 'var(--skin-simple-wait)', bg: 'var(--skin-simple-wait-bg)', label: 'Waiting', hint: 'The agent is deciding' };
    case 'rejected':
      return { icon: <CircleAlert className="size-10" />, color: 'var(--skin-simple-stop)', bg: 'var(--skin-simple-stop-bg)', label: 'Not picked', hint: 'Try another trip' };
    default:
      return { icon: <Clock className="size-10" />,       color: 'var(--color-muted-foreground)', bg: 'var(--color-surface-muted)', label: s, hint: '' };
  }
}

function Row({ app }: { app: MyApplication }) {
  const st = statusFor(app.status);
  return (
    <Link
      to={`/v7/trips/${app.trip.id}`}
      className="flex items-center gap-3 rounded-card border-2 p-4"
      style={{ borderColor: st.color, background: st.bg }}
    >
      <div style={{ color: st.color }}>{st.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold" style={{ color: st.color }}>{st.label}</div>
        <div className="text-[11px] text-muted-foreground">{st.hint}</div>
        <div className="mt-1 text-[18px] font-bold leading-tight">
          {app.trip.fromCity?.name} → {app.trip.toCity?.name}
        </div>
        <div className="text-[14px] font-semibold">{formatINR(app.trip.driverPayout)}</div>
      </div>
    </Link>
  );
}

export default SimpleMyTripsPage;
