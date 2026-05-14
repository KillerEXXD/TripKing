import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { useAdminDashboard, useApiMetricsSummary } from '@/hooks/useAnalytics';
import { TripsMonthlyChart } from '@/components/analytics';
import { Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { ApiMetricsSummary } from '@/types';

function genAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** A headline figure + an optional `{ key: count, … }` breakdown underneath. */
function StatCard({ label, value, breakdown }: { label: string; value: number | string; breakdown?: Record<string, number> }) {
  const rows = breakdown ? Object.entries(breakdown).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
  return (
    <Card className="gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {rows.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-xs text-secondary">
          {rows.map(([k, n]) => (
            <li key={k} className="flex justify-between gap-2">
              <span className="truncate">{k.replace(/_/g, ' ')}</span>
              <span className="tabular-nums font-medium">{n}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function ApiMetricsSection() {
  const q = useApiMetricsSummary();
  return (
    <Card className="gap-2">
      <h2 className="text-sm font-semibold">API metrics — last 24h</h2>
      {q.isPending ? (
        <LoadingSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load API metrics" onRetry={() => void q.refetch()} />
      ) : (
        <ApiMetricsTable m={q.data} />
      )}
    </Card>
  );
}
function ApiMetricsTable({ m }: { m: ApiMetricsSummary }) {
  return (
    <>
      <p className="text-xs text-secondary">
        {m.total.toLocaleString('en-IN')} requests · {m.errors} server error{m.errors === 1 ? '' : 's'} (5xx) · since {genAt(m.since)}
      </p>
      {m.endpoints.length === 0 ? (
        <p className="text-sm text-secondary">No requests recorded in this window.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="text-secondary">
              <tr>
                <th className="py-1 pr-2 font-medium">Endpoint</th>
                <th className="py-1 px-2 text-right font-medium">Reqs</th>
                <th className="py-1 px-2 text-right font-medium">Errors</th>
                <th className="py-1 px-2 text-right font-medium">Avg ms</th>
                <th className="py-1 pl-2 text-right font-medium">p95 ms</th>
              </tr>
            </thead>
            <tbody>
              {m.endpoints.map((e) => (
                <tr key={e.endpoint} className="border-t">
                  <td className="py-1 pr-2 font-mono">{e.endpoint}</td>
                  <td className="py-1 px-2 text-right">{e.count}</td>
                  <td className={`py-1 px-2 text-right ${e.errors > 0 ? 'font-semibold text-destructive' : ''}`}>{e.errors}</td>
                  <td className="py-1 px-2 text-right">{e.avgMs}</td>
                  <td className="py-1 pl-2 text-right">{e.p95Ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * `/administration/dashboard` — the platform dashboard (admin-only; `<AdminRoute>`-guarded).
 * Renders the server-computed `/analytics/admin` blob — users/drivers/agents/vehicles/trips
 * counts with their breakdowns, the completed-fare / commission / payout totals, the rolling
 * 6-month trips-posted-vs-completed chart, and the per-endpoint API-metrics rollup.
 */
export function AdminDashboardPage() {
  const q = useAdminDashboard();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">Platform dashboard</h1>

      {q.isPending ? (
        <LoadingSkeleton rows={8} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load the dashboard" message="Check your connection and try again." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Users" value={q.data.usersTotal} breakdown={q.data.usersByRole} />
            <StatCard label="Drivers" value={q.data.driversTotal} breakdown={q.data.driversByKyc} />
            <StatCard label="Agents" value={q.data.agentsTotal} breakdown={q.data.agentsByKyc} />
            <StatCard label="Vehicles" value={q.data.vehiclesTotal} breakdown={q.data.vehiclesByEligibility} />
            <StatCard label="Trips" value={q.data.tripsTotal} breakdown={q.data.tripsByStatus} />
            <StatCard label="Vacancies" value={Object.values(q.data.vacanciesByStatus).reduce((a, b) => a + b, 0)} breakdown={q.data.vacanciesByStatus} />
            <StatCard label="Completed fare" value={formatINR(q.data.fareCompletedTotal)} />
            <StatCard label="Commission (completed)" value={formatINR(q.data.commissionCompletedTotal)} />
            <StatCard label="Driver payout (completed)" value={formatINR(q.data.driverPayoutCompletedTotal)} />
            <StatCard label="Active alerts" value={q.data.alertsActive} />
            <StatCard label="Reviews" value={q.data.reviewsTotal} breakdown={q.data.reviewsFlagged > 0 ? { flagged: q.data.reviewsFlagged } : undefined} />
            <StatCard label="Unread notifications" value={q.data.notificationsUnread} />
          </div>

          <Card className="gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <BarChart3 className="size-4 text-secondary" aria-hidden /> Trips — last 6 months
            </div>
            <TripsMonthlyChart data={q.data.tripsMonthly} />
          </Card>

          <ApiMetricsSection />

          <p className="text-xs text-secondary">Generated {genAt(q.data.generatedAt)} · refreshes every minute.</p>
        </>
      )}
    </main>
  );
}

export default AdminDashboardPage;
