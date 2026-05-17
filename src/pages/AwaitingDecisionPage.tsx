import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { Badge, Button, Card } from '@/components/ui';
import { QueueListPage } from '@/components/queue/QueueListPage';
import { formatINR, formatKmAndDuration, formatPickupDateTime } from '@/lib/utils';
import type { MyApplication } from '@/types';

/**
 * `/my-trips/awaiting` — the driver's work-queue of trips an agent has *selected*
 * them for, pending the driver's Accept / Decline. One card per application →
 * tap opens the trip detail (where the `<AcceptTripDialog>` lives). Built on
 * `<QueueListPage>` so back returns to Home and the page auto-bounces home
 * once every selection has been resolved.
 */
export function AwaitingDecisionPage() {
  const query = useMyApplications();
  const awaiting = (query.data ?? []).filter((a) => a.status === 'selected');

  return (
    <QueueListPage
      title="Awaiting your decision"
      subtitle={awaiting.length > 0 ? `${awaiting.length} trip${awaiting.length === 1 ? '' : 's'} waiting on you` : undefined}
      icon={<Sparkles className="size-4" />}
      tone="indigo"
      items={awaiting}
      getKey={(a) => a.acceptanceId}
      renderItem={(a) => <SelectedRow app={a} />}
      isPending={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      emptyTitle="No selections waiting"
      emptyMessage="When a trip manager picks you for one of your applications, it'll appear here so you can Accept or Decline."
      emptyAction={
        <Button asChild variant="outline" size="sm">
          <Link to="/my-trips?tab=applied">View all applications</Link>
        </Button>
      }
    />
  );
}

function SelectedRow({ app }: { app: MyApplication }) {
  const t = app.trip;
  return (
    <Card className="gap-0 p-0">
      <Link to={`/trips/${t.id}?from=/my-trips/awaiting`} className="block space-y-1.5 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">{t.fromCity.name} → {t.toCity.name}</div>
            <div className="truncate text-xs text-secondary">
              {formatKmAndDuration(t.expectedDistanceKm)} · {formatINR(t.ratePerKm)}/km · {formatINR(t.totalFare)} fare · +{formatINR(t.driverBata)} bata
            </div>
          </div>
          <Badge variant="success" className="shrink-0">Selected — you got it!</Badge>
        </div>
        <div className="text-xs text-secondary">
          Pickup: {formatPickupDateTime(t.pickupAt)}
          {app.applicantQuotedRatePerKm ? ` · you quoted ${formatINR(app.applicantQuotedRatePerKm)}/km` : ''}
        </div>
      </Link>
      <div className="flex items-center justify-end border-t px-4 py-2.5 text-xs font-semibold">
        <Link to={`/trips/${t.id}?from=/my-trips/awaiting`} className="flex items-center text-primary">
          Accept or Decline
          <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export default AwaitingDecisionPage;
