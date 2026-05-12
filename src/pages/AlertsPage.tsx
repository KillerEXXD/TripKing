import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, MapPin, Plus } from 'lucide-react';
import { useMyAlerts } from '@/hooks/useAlerts';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { cn, formatINR } from '@/lib/utils';
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
            <div className="flex items-center gap-1.5 truncate font-bold">
              <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden /> {alert.name || routeLabel(alert)}
            </div>
            <div className="truncate text-xs text-secondary">{routeLabel(alert)}</div>
          </div>
          <Badge variant={alert.isActive ? 'success' : 'muted'} className="shrink-0">
            {alert.isActive ? 'Active' : 'Paused'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
          <span>📍 {alert.fromRadiusKm} km radius</span>
          {alert.minRatePerKm ? <span>≥ {formatINR(alert.minRatePerKm)}/km</span> : null}
          {alert.carTypeIds.length > 0 ? <span>{alert.carTypeIds.length} car type{alert.carTypeIds.length === 1 ? '' : 's'}</span> : null}
          {alert.notifyVia.length > 0 ? <span>via {alert.notifyVia.join(', ')}</span> : null}
        </div>
      </Card>
    </Link>
  );
}

function Section({ title, dotClass, alerts }: { title: string; dotClass: string; alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className={cn('size-2 rounded-full', dotClass)} aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">{title}</h2>
        <Badge variant="muted">{alerts.length}</Badge>
      </div>
      <div className="space-y-3">
        {alerts.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>
    </section>
  );
}

/**
 * `/alerts` — the caller's saved-search alerts (`useMyAlerts`), laid out like the
 * prototype: a white header strip, then Active / Paused sections of alert cards
 * (route name, radius / ≥₹·km / car types / channels, state badge) each linking
 * to the alert detail (where pause / resume / delete live). New alerts at `/alerts/new`.
 */
export function AlertsPage() {
  const navigate = useNavigate();
  const alertsQuery = useMyAlerts();
  const alerts = alertsQuery.data ?? [];
  const active = alerts.filter((a) => a.isActive);
  const paused = alerts.filter((a) => !a.isActive);

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b bg-white px-4 py-3">
        <button type="button" aria-label="Back" onClick={() => navigate('/')} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Trip alerts</h1>
          <p className="text-xs text-secondary">{alertsQuery.isSuccess ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'}` : 'Get pinged when a matching trip appears'}</p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/alerts/new">
            <Plus className="size-4" aria-hidden /> New
          </Link>
        </Button>
      </header>

      <div className="space-y-5 p-4">
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
          <>
            <Section title="Active" dotClass="bg-emerald-500" alerts={active} />
            <Section title="Paused" dotClass="bg-gray-400" alerts={paused} />
          </>
        )}
      </div>
    </div>
  );
}

export default AlertsPage;
