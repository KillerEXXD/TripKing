import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { Pause, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAlert, useDeleteAlert, useSetAlertActive } from '@/hooks/useAlerts';
import { useAppBack } from '@/hooks/useAppBack';
import { Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatINR } from '@/lib/utils';
import type { Alert } from '@/types';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-secondary">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function AlertDetail({ alert }: { alert: Alert }) {
  const navigate = useNavigate();
  const setActive = useSetAlertActive();
  const del = useDeleteAlert();
  const busy = setActive.isPending || del.isPending;

  function onToggle() {
    setActive.mutate({ id: alert.id, isActive: !alert.isActive });
  }
  async function onDelete() {
    try {
      await del.mutateAsync(alert.id);
      toast.success('Alert deleted');
      navigate('/app/alerts');
    } catch {
      toast.error("Couldn't delete the alert — try again.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold">{alert.name || `${alert.fromCity.name} → ${alert.toCity ? alert.toCity.name : 'anywhere'}`}</h1>
        <Badge variant={alert.isActive ? 'success' : 'muted'}>{alert.isActive ? 'Active' : 'Paused'}</Badge>
      </div>

      <Card className="gap-2">
        <Row label="Pickup" value={`${alert.fromCity.name} · within ${alert.fromRadiusKm} km`} />
        <Row label="Destination" value={alert.toCity ? `${alert.toCity.name}${alert.toRadiusKm ? ` · within ${alert.toRadiusKm} km` : ''}` : 'Any'} />
        <Row label="Minimum rate" value={alert.minRatePerKm ? `${formatINR(alert.minRatePerKm)}/km` : 'Any'} />
        {alert.minCommissionPct ? <Row label="Minimum commission" value={`${alert.minCommissionPct}%`} /> : null}
        <Row label="Car types" value={alert.carTypeIds.length > 0 ? `${alert.carTypeIds.length} selected` : 'Any'} />
        {alert.pickupWindowStart || alert.pickupWindowEnd ? (
          <Row label="Pickup window" value={`${alert.pickupWindowStart ?? '—'} → ${alert.pickupWindowEnd ?? '—'}`} />
        ) : null}
        <Row label="Notify via" value={alert.notifyVia.length > 0 ? alert.notifyVia.join(', ') : '—'} />
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onToggle} disabled={busy}>
          {alert.isActive ? (
            <>
              <Pause className="size-4" aria-hidden /> {setActive.isPending ? 'Pausing…' : 'Pause'}
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden /> {setActive.isPending ? 'Resuming…' : 'Resume'}
            </>
          )}
        </Button>
        <Button variant="destructive" onClick={() => void onDelete()} disabled={busy}>
          <Trash2 className="size-4" aria-hidden /> {del.isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </div>
  );
}

/** `/app/alerts/:id` — one saved-search alert: criteria, pause/resume, delete. */
export function AlertDetailPage() {
  const back = useAppBack('/app/alerts');
  const { id } = useParams<{ id: string }>();
  const alertQuery = useAlert(id);
  const notFound = !id || (alertQuery.isError && alertQuery.error instanceof ApiError && alertQuery.error.status === 404);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Alert" onBack={back} />

      <div className="space-y-4 p-4">
        {notFound ? (
          <ErrorState title="Alert not found" message="It may have been deleted." />
        ) : alertQuery.isPending ? (
          <LoadingSkeleton rows={5} />
        ) : alertQuery.isError ? (
          <ErrorState title="Couldn't load this alert" message="Check your connection and try again." onRetry={() => void alertQuery.refetch()} />
        ) : (
          <AlertDetail alert={alertQuery.data} />
        )}
      </div>
    </div>
  );
}

export default AlertDetailPage;
