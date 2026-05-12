import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useMyAlerts } from '@/hooks/useAlerts';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { Alert } from '@/types';

function routeLabel(a: Alert): string {
  return `${a.fromCity.name} → ${a.toCity ? a.toCity.name : 'anywhere'}`;
}

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <Link to={`/alerts/${alert.id}`} className="block">
      <Card className="gap-2 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold">{alert.name || routeLabel(alert)}</div>
            <div className="text-xs text-secondary">{routeLabel(alert)}</div>
          </div>
          <Badge variant={alert.isActive ? 'success' : 'muted'}>{alert.isActive ? 'Active' : 'Paused'}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-secondary">
          {alert.minRatePerKm ? <Badge variant="muted">≥ {formatINR(alert.minRatePerKm)}/km</Badge> : null}
          {alert.carTypeIds.length > 0 ? <Badge variant="muted">{alert.carTypeIds.length} car type{alert.carTypeIds.length === 1 ? '' : 's'}</Badge> : null}
          {alert.notifyVia.length > 0 ? <span>via {alert.notifyVia.join(', ')}</span> : null}
        </div>
      </Card>
    </Link>
  );
}

/**
 * `/alerts` — the caller's saved-search alerts (`useMyAlerts`). Each fires a
 * notification when a matching trip appears; cards show the route, criteria and
 * active/paused state, and link to the alert detail. New alerts are created at
 * `/alerts/new`.
 */
export function AlertsPage() {
  const alertsQuery = useMyAlerts();
  const alerts = alertsQuery.data ?? [];

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Trip alerts</h1>
          <p className="text-sm text-secondary">{alertsQuery.isSuccess ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'}` : 'Get pinged when a matching trip appears'}</p>
        </div>
        <Button asChild variant="full" size="sm">
          <Link to="/alerts/new">New alert</Link>
        </Button>
      </header>

      {alertsQuery.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : alertsQuery.isError ? (
        <ErrorState title="Couldn't load your alerts" message="Check your connection and try again." onRetry={() => void alertsQuery.refetch()} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-7" />}
          title="No alerts yet"
          message="Create an alert and we'll notify you when a trip matches it."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/alerts/new">New alert</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}
    </main>
  );
}

export default AlertsPage;
