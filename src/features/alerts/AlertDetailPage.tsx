import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Clock,
  MapPin,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Wallet,
  Globe2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAlertsStore } from '@/stores/alertsStore';
import { useTrips } from '@/hooks/useTrips';
import { useMyApplicationsStore, hasActiveApplication } from '@/stores/myApplicationsStore';
import {
  alertDisplayName,
  findMatches,
  getAlertStatus,
  type AlertStatus,
} from '@/lib/alertMatcher';
import { formatINR, formatKm } from '@/lib/utils';
import { tripApproxDriverCost, tripDriverBata } from '@/lib/tripDefaults';
import { toast } from 'sonner';

const STATUS_LABEL: Record<AlertStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
};

export function AlertDetailPage() {
  const { alertId } = useParams<{ alertId: string }>();
  const navigate = useNavigate();

  const alert = useAlertsStore((s) => s.alerts.find((a) => a.id === alertId));
  const togglePause = useAlertsStore((s) => s.togglePause);
  const deleteAlert = useAlertsStore((s) => s.deleteAlert);
  const { data: trips = [] } = useTrips();
  const applications = useMyApplicationsStore((s) => s.byTrip);

  const now = new Date();
  const status: AlertStatus | null = alert ? getAlertStatus(alert, now) : null;

  // Live matches given the saved window
  const liveMatches = useMemo(() => {
    if (!alert) return [];
    return findMatches(alert, trips);
  }, [alert, trips]);

  // For expired alerts: trips that match all rules except the time window
  const wouldHaveMatched = useMemo(() => {
    if (!alert || status !== 'expired') return [];
    return findMatches(alert, trips, { ignoreWindow: true });
  }, [alert, trips, status]);

  if (!alert) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/driver/alerts')}>
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="font-semibold">Alert not found</h1>
        </header>
        <div className="p-6 text-sm text-muted-foreground">
          This alert may have been deleted.
        </div>
      </div>
    );
  }

  const handleDelete = () => {
    if (!confirm('Delete this alert?')) return;
    deleteAlert(alert.id);
    toast.success('Alert deleted');
    navigate('/driver/alerts');
  };

  const matchesShown = status === 'expired' ? wouldHaveMatched : liveMatches;
  const expiresAt = new Date(alert.pickupUntil);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/driver/alerts')}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">Alert</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Summary card */}
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Bell className="size-4 text-primary shrink-0" />
                  <span className="truncate">{alertDisplayName(alert)}</span>
                </h2>
                <div className="text-xs text-muted-foreground mt-1">
                  Created{' '}
                  {new Date(alert.createdAt).toLocaleString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              <StatusBadge status={status!} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Field
                icon={<MapPin className="size-3.5" />}
                label="From"
                value={alert.from.name}
                hint={`within ${alert.fromRadiusKm} km`}
              />
              <Field
                icon={<Globe2 className="size-3.5" />}
                label="To"
                value={alert.to ? alert.to.name : 'Anywhere'}
                hint={
                  alert.to && alert.toRadiusKm != null
                    ? `within ${alert.toRadiusKm} km`
                    : 'no destination filter'
                }
              />
              <Field
                icon={<Clock className="size-3.5" />}
                label="Watch from"
                value={new Date(alert.pickupFrom).toLocaleString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                  day: 'numeric',
                  month: 'short',
                })}
              />
              <Field
                icon={<Clock className="size-3.5" />}
                label="Watch until"
                value={expiresAt.toLocaleString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                  day: 'numeric',
                  month: 'short',
                })}
              />
              {alert.minRatePerKm != null && (
                <Field
                  icon={<Wallet className="size-3.5" />}
                  label="Minimum"
                  value={`₹${alert.minRatePerKm}/km`}
                />
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t">
              {status !== 'expired' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    togglePause(alert.id);
                    toast.success(alert.isPaused ? 'Resumed' : 'Paused');
                  }}
                >
                  {alert.isPaused ? (
                    <>
                      <Play className="size-4" /> Resume
                    </>
                  ) : (
                    <>
                      <Pause className="size-4" /> Pause
                    </>
                  )}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="flex-1 text-destructive hover:text-destructive border-destructive/30"
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Matches list */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              <Sparkles className="size-4 text-amber-500" />
              {status === 'expired' ? 'Trips that would have matched' : 'Live matches'}
            </h3>
            <Badge variant={matchesShown.length > 0 ? 'success' : 'muted'}>
              {matchesShown.length}
            </Badge>
          </div>

          {matchesShown.length === 0 ? (
            <Card className="text-center py-8 text-sm text-muted-foreground">
              <CardContent className="space-y-1">
                <Bell className="size-6 mx-auto opacity-30" />
                <div className="font-medium text-foreground">
                  {status === 'expired'
                    ? 'No trips were posted in this window.'
                    : "No matches yet — we'll notify you when a trip matches."}
                </div>
                {status === 'active' && alert.isPaused && (
                  <div className="text-xs">
                    This alert is paused — resume it to receive notifications.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {matchesShown.map((trip) => (
                <Card
                  key={trip.id}
                  className="cursor-pointer hover:border-primary/40"
                  onClick={() => navigate(`/driver/trips/${trip.id}`)}
                >
                  <CardContent>
                    <div className="flex items-start justify-between mb-1">
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">
                          {trip.fromCity.name} → {trip.toCity.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatKm(trip.expectedDistanceKm)} ·{' '}
                          {new Date(trip.pickupDateTime).toLocaleString('en-IN', {
                            weekday: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold">
                          {formatINR(tripApproxDriverCost(trip))}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          payout · ₹{tripDriverBata(trip)} bata incl.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline">{trip.carTypeRequired}</Badge>
                      {trip.acRequired && <Badge variant="outline">AC</Badge>}
                      <Badge variant="muted">₹{trip.ratePerKm}/km</Badge>
                      {trip.applicantCount > 0 && (
                        <Badge variant="warning">
                          {trip.applicantCount} applied
                        </Badge>
                      )}
                      {hasActiveApplication(trip.id, applications) && (
                        <Badge variant="success">✓ You applied</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mb-0.5">
        {icon}
        {label}
      </div>
      <div className="font-semibold text-sm">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: AlertStatus }) {
  const map = {
    active: { variant: 'success' as const, dot: 'bg-emerald-500' },
    paused: { variant: 'muted' as const, dot: 'bg-gray-400' },
    expired: { variant: 'warning' as const, dot: 'bg-amber-500' },
  };
  const m = map[status];
  return (
    <Badge variant={m.variant}>
      <span className={`size-1.5 rounded-full ${m.dot}`} /> {STATUS_LABEL[status]}
    </Badge>
  );
}
