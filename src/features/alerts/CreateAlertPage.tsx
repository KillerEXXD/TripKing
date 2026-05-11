import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Trash2, Wallet, Globe2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LocationSearchPanel,
  type LocationValue,
} from '@/components/location/LocationSearchPanel';
import { useAlertsStore } from '@/stores/alertsStore';
import { useGoBack } from '@/hooks/useGoBack';
import { mockCities } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const RADIUS_OPTIONS = [10, 25, 50, 100] as const;

const DEFAULT_FROM: LocationValue = {
  name: mockCities[0]!.name,
  state: mockCities[0]!.state,
  lat: mockCities[0]!.lat,
  lng: mockCities[0]!.lng,
};

/** Format a Date as the value local datetime-input expects ("YYYY-MM-DDTHH:mm"). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateAlertPage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/driver/alerts');
  const addAlert = useAlertsStore((s) => s.addAlert);

  const [from, setFrom] = useState<LocationValue>(DEFAULT_FROM);
  const [fromRadius, setFromRadius] = useState<number>(25);
  const [fromOpen, setFromOpen] = useState(false);

  const [to, setTo] = useState<LocationValue | null>(null);
  const [toRadius, setToRadius] = useState<number>(25);
  const [toOpen, setToOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }, [now]);
  const [pickupFrom, setPickupFrom] = useState<string>(toLocalInputValue(now));
  const [pickupUntil, setPickupUntil] = useState<string>(toLocalInputValue(tomorrow));

  const [minRate, setMinRate] = useState<string>('');
  const [name, setName] = useState<string>('');

  const submit = () => {
    if (new Date(pickupUntil).getTime() <= new Date(pickupFrom).getTime()) {
      toast.error('"Until" must be after "From"');
      return;
    }
    const minRateNum = minRate.trim() ? parseFloat(minRate) : null;
    if (minRateNum != null && (Number.isNaN(minRateNum) || minRateNum < 0)) {
      toast.error('Invalid minimum rate');
      return;
    }
    addAlert({
      name: name.trim() || undefined,
      from,
      fromRadiusKm: fromRadius,
      to: to ?? null,
      toRadiusKm: to ? toRadius : null,
      pickupFrom: new Date(pickupFrom).toISOString(),
      pickupUntil: new Date(pickupUntil).toISOString(),
      minRatePerKm: minRateNum,
    });
    toast.success('Alert created — we will notify you on a match');
    navigate('/driver/alerts');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">New Alert</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Optional name */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Label (optional)
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Vellore → Chennai morning runs"'
            />
          </CardContent>
        </Card>

        {/* FROM */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              From location
            </div>
            <button
              type="button"
              onClick={() => setFromOpen((v) => !v)}
              className="flex items-start gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-input hover:border-primary/40 transition-colors"
            >
              <MapPin className="size-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{from.name}</div>
                {from.displayName && (
                  <div className="text-xs text-muted-foreground truncate">
                    {from.displayName}
                  </div>
                )}
              </div>
              <span className="text-xs text-primary font-semibold self-center shrink-0">
                Change
              </span>
            </button>
            {fromOpen && (
              <LocationSearchPanel
                title="Set 'from' location"
                onPick={(loc) => {
                  setFrom(loc);
                  setFromOpen(false);
                }}
                onClose={() => setFromOpen(false)}
              />
            )}
            <RadiusPicker value={fromRadius} onChange={setFromRadius} />
          </CardContent>
        </Card>

        {/* TO (optional) */}
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                To location
              </div>
              {to ? (
                <button
                  type="button"
                  onClick={() => setTo(null)}
                  className="text-xs text-destructive font-semibold flex items-center gap-1"
                >
                  <Trash2 className="size-3" /> Clear
                </button>
              ) : (
                <Badge variant="muted">any destination</Badge>
              )}
            </div>

            {to ? (
              <button
                type="button"
                onClick={() => setToOpen((v) => !v)}
                className="flex items-start gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-input hover:border-primary/40 transition-colors"
              >
                <MapPin className="size-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{to.name}</div>
                  {to.displayName && (
                    <div className="text-xs text-muted-foreground truncate">
                      {to.displayName}
                    </div>
                  )}
                </div>
                <span className="text-xs text-primary font-semibold self-center shrink-0">
                  Change
                </span>
              </button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setToOpen(true)}
              >
                <Globe2 className="size-4" /> Add destination filter
              </Button>
            )}

            {toOpen && (
              <LocationSearchPanel
                title="Set 'to' location"
                onPick={(loc) => {
                  setTo(loc);
                  setToOpen(false);
                }}
                onClose={() => setToOpen(false)}
              />
            )}

            {to && <RadiusPicker value={toRadius} onChange={setToRadius} />}
          </CardContent>
        </Card>

        {/* TIME WINDOW */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Watch window
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  From
                </div>
                <Input
                  type="datetime-local"
                  value={pickupFrom}
                  onChange={(e) => setPickupFrom(e.target.value)}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Until
                </div>
                <Input
                  type="datetime-local"
                  value={pickupUntil}
                  onChange={(e) => setPickupUntil(e.target.value)}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              The alert auto-expires after "Until" — no more notifications past that
              time.
            </div>
          </CardContent>
        </Card>

        {/* MIN RATE */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Minimum rate per km (optional)
            </div>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="number"
                inputMode="decimal"
                value={minRate}
                onChange={(e) => setMinRate(e.target.value)}
                placeholder="e.g. 14"
                className="pl-9"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Only notify when the trip pays at least this much per km.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4">
        <Button variant="full" size="lg" className="w-full" onClick={submit}>
          CREATE ALERT
        </Button>
      </div>
    </div>
  );
}

function RadiusPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Search radius
      </div>
      <div className="flex gap-1.5">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={cn(
              'flex-1 px-2 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              value === r
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-white hover:border-primary/40',
            )}
          >
            {r} km
          </button>
        ))}
      </div>
    </div>
  );
}
