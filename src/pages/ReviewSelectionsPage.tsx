import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { useAppBack } from '@/hooks/useAppBack';
import { Badge, Button, Card } from '@/components/ui';
import { ScopedPageHeader } from '@/components/layout';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatKmAndDuration, formatPickupDateTime } from '@/lib/utils';
import type { MyApplication } from '@/types';

/**
 * `/app/my-trips/review` — a driver's dedicated review list. Shows every application
 * with `status='selected'` (the agent has picked them; the driver needs to
 * Accept or Decline). The home-page "Review" card sends multi-trip drivers here.
 *
 * Back-button origin memory is handled by useAppBack: the entry point passes
 * `state.from` as a path (e.g. `/app` or `/app/my-trips`); the hook routes the
 * back arrow there, or falls through to navigate(-1) / `/app/my-trips` on deep-link.
 * Tapping into a trip forwards the same `from` so the trip detail's Back chains through.
 */
export function ReviewSelectionsPage() {
  const onBack = useAppBack('/app/my-trips');
  const location = useLocation();
  // Forward the same `state.from` path on inner trip-detail Links so the chain continues.
  const from = (location.state as { from?: string } | null)?.from;
  const query = useMyApplications();
  const awaiting = (query.data ?? []).filter((a) => a.status === 'selected');

  return (
    <div className="mx-auto max-w-md">
      {/* Indigo tint mirrors AwaitingMyDecisionCard's tone on Driver home. */}
      <ScopedPageHeader
        title="Trips to review"
        subtitle={awaiting.length > 0 ? `${awaiting.length} trip${awaiting.length === 1 ? '' : 's'} waiting on your accept` : undefined}
        icon={<Sparkles className="size-4" aria-hidden />}
        onBack={onBack}
        tone="indigo"
      />

      <div className="space-y-3 p-4">
        {query.isPending ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState
            title="Couldn't load your selections"
            message="Check your connection and try again."
            onRetry={() => void query.refetch()}
          />
        ) : awaiting.length === 0 ? (
          <EmptyState
            title="No trips to review"
            message="When an agent picks you for a trip you applied to, it'll appear here so you can Accept or Decline."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/app/my-trips?tab=applied">View all applications</Link>
              </Button>
            }
          />
        ) : (
          awaiting.map((a) => <SelectedTripCard key={a.acceptanceId} app={a} from={from ?? undefined} />)
        )}
      </div>
    </div>
  );
}

function SelectedTripCard({ app, from }: { app: MyApplication; from: string | undefined }) {
  const t = app.trip;
  const state = from ? { from, via: 'review' as const } : { via: 'review' as const };
  return (
    <Card className="gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/app/trips/${t.id}`}
            state={state}
            className="font-bold underline-offset-2 hover:underline"
          >
            {t.fromCity.name} → {t.toCity.name}
          </Link>
          <div className="text-xs text-secondary">
            Pickup: {formatPickupDateTime(t.pickupAt)}
          </div>
          <div className="text-xs text-secondary">
            {formatKmAndDuration(t.expectedDistanceKm)} · {formatINR(t.ratePerKm)}/km · {formatINR(t.totalFare)} fare · {formatINR(t.driverPayout)} driver payout
          </div>
        </div>
        <Badge variant="success" className="shrink-0">Selected — you got it!</Badge>
      </div>
      {t.postedByName ? (
        <div className="text-xs text-secondary">
          Posted by <span className="font-semibold text-foreground">{t.postedByName}</span>
        </div>
      ) : null}
      {app.applicantQuotedRatePerKm ? (
        <div className="text-sm">
          You quoted: <span className="font-semibold">{formatINR(app.applicantQuotedRatePerKm)}/km</span>
        </div>
      ) : null}
      {app.applicantMessage ? (
        <p className="text-sm text-secondary">“{app.applicantMessage}”</p>
      ) : null}
      <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
        <span className="text-secondary">+ {formatINR(t.driverBata)} bata</span>
        <Link to={`/app/trips/${t.id}`} state={state} className="flex items-center text-primary">
          Accept or Decline
          <ChevronRight className="ml-0.5 size-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export default ReviewSelectionsPage;
