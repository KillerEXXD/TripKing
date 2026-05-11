import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Plus,
  Pause,
  Play,
  Trash2,
  Clock,
  Sparkles,
  MapPin,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAlertsStore } from '@/stores/alertsStore';
import { useTrips } from '@/hooks/useTrips';
import { useGoBack } from '@/hooks/useGoBack';
import {
  alertDisplayName,
  findMatches,
  getAlertStatus,
  type UIAlert,
} from '@/lib/alertMatcher';
import { cn } from '@/lib/utils';

function timeUntilLabel(iso: string, now: Date): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const hrs = mins / 60;
  const days = hrs / 24;

  if (past) {
    if (mins < 60) return `expired ${mins}m ago`;
    if (hrs < 24) return `expired ${Math.round(hrs)}h ago`;
    return `expired ${Math.round(days)}d ago`;
  }
  if (mins < 60) return `expires in ${mins}m`;
  if (hrs < 24) return `expires in ${Math.round(hrs)}h`;
  return `expires in ${Math.round(days)}d`;
}

export function AlertsPage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/home');
  const alerts = useAlertsStore((s) => s.alerts);
  const togglePause = useAlertsStore((s) => s.togglePause);
  const deleteAlert = useAlertsStore((s) => s.deleteAlert);
  const { data: trips = [] } = useTrips();

  // Bucket by status
  const now = new Date();
  const { active, paused, expired } = useMemo(() => {
    const buckets = { active: [] as UIAlert[], paused: [] as UIAlert[], expired: [] as UIAlert[] };
    for (const a of alerts) {
      const s = getAlertStatus(a, now);
      buckets[s].push(a);
    }
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="font-semibold">Alerts</h1>
        </div>
        <Button size="sm" onClick={() => navigate('/driver/alerts/new')}>
          <Plus className="size-4" /> New
        </Button>
      </header>

      <div className="p-4 space-y-5">
        {alerts.length === 0 && (
          <Card className="text-center py-10">
            <CardContent className="space-y-2">
              <Bell className="size-8 mx-auto opacity-30" />
              <div className="font-semibold">No alerts yet</div>
              <div className="text-sm text-muted-foreground">
                Set up an alert to get notified when a matching trip is posted.
              </div>
              <Button
                className="mx-auto mt-2"
                onClick={() => navigate('/driver/alerts/new')}
              >
                <Plus className="size-4" /> Create alert
              </Button>
            </CardContent>
          </Card>
        )}

        <Section
          title="Active"
          dotClass="bg-emerald-500"
          count={active.length}
          alerts={active}
          trips={trips}
          now={now}
          onClick={(a) => navigate(`/driver/alerts/${a.id}`)}
          onTogglePause={togglePause}
          onDelete={(a) => deleteAlert(a.id)}
        />

        <Section
          title="Paused"
          dotClass="bg-gray-400"
          count={paused.length}
          alerts={paused}
          trips={trips}
          now={now}
          onClick={(a) => navigate(`/driver/alerts/${a.id}`)}
          onTogglePause={togglePause}
          onDelete={(a) => deleteAlert(a.id)}
        />

        <Section
          title="Expired"
          dotClass="bg-amber-500"
          count={expired.length}
          alerts={expired}
          trips={trips}
          now={now}
          dim
          onClick={(a) => navigate(`/driver/alerts/${a.id}`)}
          onTogglePause={togglePause}
          onDelete={(a) => deleteAlert(a.id)}
        />
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  dotClass: string;
  count: number;
  alerts: UIAlert[];
  trips: ReturnType<typeof useTrips>['data'];
  now: Date;
  dim?: boolean;
  onClick: (a: UIAlert) => void;
  onTogglePause: (id: string) => void;
  onDelete: (a: UIAlert) => void;
}

function Section({
  title,
  dotClass,
  count,
  alerts,
  trips = [],
  now,
  dim,
  onClick,
  onTogglePause,
  onDelete,
}: SectionProps) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className={cn('size-2 rounded-full', dotClass)} />
        <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <Badge variant="muted">{count}</Badge>
      </div>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            matches={findMatches(alert, trips, { ignoreWindow: false }).length}
            wouldMatch={
              dim
                ? findMatches(alert, trips, { ignoreWindow: true }).length
                : undefined
            }
            now={now}
            dim={dim}
            onClick={() => onClick(alert)}
            onTogglePause={() => onTogglePause(alert.id)}
            onDelete={() => onDelete(alert)}
          />
        ))}
      </div>
    </section>
  );
}

interface AlertRowProps {
  alert: UIAlert;
  matches: number;
  /** When alert is expired, how many trips would still match if extended. */
  wouldMatch?: number;
  now: Date;
  dim?: boolean;
  onClick: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}

function AlertRow({
  alert,
  matches,
  wouldMatch,
  now,
  dim,
  onClick,
  onTogglePause,
  onDelete,
}: AlertRowProps) {
  const expired = dim;

  return (
    <Card
      className={cn(
        'p-0 overflow-hidden cursor-pointer transition-colors',
        expired && 'opacity-70 bg-gray-50',
        !expired && matches > 0 && 'border-emerald-200 bg-emerald-50/30',
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-bold text-sm truncate">
              <MapPin className="size-3.5 text-primary shrink-0" />
              {alertDisplayName(alert)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
              <span>📍 {alert.fromRadiusKm} km radius</span>
              {alert.minRatePerKm != null && (
                <span>≥ ₹{alert.minRatePerKm}/km</span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="size-3" /> {timeUntilLabel(alert.pickupUntil, now)}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            {!expired ? (
              matches > 0 ? (
                <Badge variant="success" className="text-xs">
                  <Sparkles className="size-3" /> {matches} match
                  {matches > 1 ? 'es' : ''}
                </Badge>
              ) : (
                <Badge variant="muted" className="text-xs">
                  no matches yet
                </Badge>
              )
            ) : (
              <Badge variant="warning" className="text-xs">
                {wouldMatch ? `${wouldMatch} missed` : 'expired'}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1 border-t">
          {!expired && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePause();
              }}
              className="text-xs"
            >
              {alert.isPaused ? (
                <>
                  <Play className="size-3.5" /> Resume
                </>
              ) : (
                <>
                  <Pause className="size-3.5" /> Pause
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this alert?')) onDelete();
            }}
            className="text-xs text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
