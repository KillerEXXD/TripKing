import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatKm, formatPickupTime } from '@/lib/utils';
import type { MyApplication } from '@/types';

/**
 * `/my-trips/awaiting` — only the trips an agent has *selected* this driver for,
 * pending the driver's Accept / Decline. Sourced from `useMyApplications` filtered
 * client-side. One card per trip → tap opens the trip detail (where the
 * `<AcceptTripDialog>` lives).
 */
export function AwaitingDecisionPage() {
  const navigate = useNavigate();
  const query = useMyApplications();
  // Acceptance row 'selected' AND trip still 'selected' — once accepted, the trip
  // moves on (accepted / in_progress / completed) but the acceptance row stays
  // historically 'selected'. Filter those out.
  const awaiting = (query.data ?? []).filter((a) => a.status === 'selected' && a.trip.status === 'selected');

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-3 border-b bg-white px-4 py-3">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="flex items-center gap-1.5 text-base font-semibold">
          <Sparkles className="size-4 text-blue-700" aria-hidden /> Awaiting your decision
        </h1>
      </header>

      <div className="space-y-3 p-4">
        {query.isPending ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState title="Couldn't load your selections" message="Check your connection and try again." onRetry={() => void query.refetch()} />
        ) : awaiting.length === 0 ? (
          <EmptyState
            title="No selections waiting"
            message="When a trip manager picks you for one of your applications, it'll appear here so you can Accept or Decline."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/my-trips?tab=applied">View all applications</Link>
              </Button>
            }
          />
        ) : (
          awaiting.map((a) => <SelectedRow key={a.acceptanceId} app={a} />)
        )}
      </div>
    </div>
  );
}

function SelectedRow({ app }: { app: MyApplication }) {
  const t = app.trip;
  return (
    <Card className="gap-0 p-0">
      <Link to={`/trips/${t.id}`} className="block space-y-1.5 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">{t.fromCity.name} → {t.toCity.name}</div>
            <div className="truncate text-xs text-secondary">
              {formatKm(t.expectedDistanceKm)} · {formatINR(t.ratePerKm)}/km · {formatINR(t.totalFare)} fare · +{formatINR(t.driverBata)} bata
            </div>
          </div>
          <Badge variant="success" className="shrink-0">Selected — you got it!</Badge>
        </div>
        <div className="text-xs text-secondary">
          Pickup: {formatPickupTime(t.pickupAt)}
          {app.applicantQuotedRatePerKm ? ` · you quoted ${formatINR(app.applicantQuotedRatePerKm)}/km` : ''}
        </div>
      </Link>
      <div className="flex items-center justify-end border-t px-4 py-2.5 text-xs font-semibold">
        <Link to={`/trips/${t.id}`} className="flex items-center text-primary">
          Accept or Decline
          <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export default AwaitingDecisionPage;
