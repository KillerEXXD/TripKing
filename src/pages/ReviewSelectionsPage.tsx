import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatKmAndDuration, formatPickupDateTime } from '@/lib/utils';
import type { MyApplication } from '@/types';

type Origin = 'home' | 'my-trips';
function isOrigin(v: unknown): v is Origin {
  return v === 'home' || v === 'my-trips';
}

/**
 * `/my-trips/review` — a driver's dedicated review list. Shows every application
 * with `status='selected'` (the agent has picked them; the driver needs to
 * Accept or Decline). The home-page "Review" card sends multi-trip drivers here.
 *
 * Back-button origin memory: the entry point passes `state.from` ('home' or
 * 'my-trips'); the header's Back routes there. Deep-links (no state) fall back
 * to `navigate(-1)`. Tapping into a trip forwards the same `from` so the trip
 * detail page's Back can chain through.
 */
export function ReviewSelectionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = isOrigin((location.state as { from?: unknown } | null)?.from)
    ? ((location.state as { from: Origin }).from)
    : undefined;
  const query = useMyApplications();
  const awaiting = (query.data ?? []).filter((a) => a.status === 'selected');

  function onBack() {
    if (from === 'home') navigate('/');
    else if (from === 'my-trips') navigate('/my-trips');
    else navigate(-1);
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-surface px-4 py-3 shadow-header">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="flex items-center gap-1.5 text-base font-semibold">
          <Sparkles className="size-4 text-blue-700" aria-hidden /> Trips to review
        </h1>
      </header>

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
                <Link to="/my-trips?tab=applied">View all applications</Link>
              </Button>
            }
          />
        ) : (
          awaiting.map((a) => <SelectedTripCard key={a.acceptanceId} app={a} from={from} />)
        )}
      </div>
    </div>
  );
}

function SelectedTripCard({ app, from }: { app: MyApplication; from: Origin | undefined }) {
  const t = app.trip;
  const state = from ? { from, via: 'review' as const } : { via: 'review' as const };
  return (
    <Card className="gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/trips/${t.id}`}
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
        <Link to={`/trips/${t.id}`} state={state} className="flex items-center text-primary">
          Accept or Decline
          <ChevronRight className="ml-0.5 size-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export default ReviewSelectionsPage;
