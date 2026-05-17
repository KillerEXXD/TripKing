import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Flag, IndianRupee, Phone } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { useTripDetail } from '@/pages/v2/shared/useTripDetail';

/**
 * v7 Simple Mode — trip detail. A vertical 3-step ladder:
 *   1. Where to pick up (green pin)
 *   2. Where to drop  (red flag)
 *   3. How much money (yellow rupee)
 * One big green button at the bottom. One big red button to refuse.
 */
export function SimpleTripDetailPage() {
  const { isLoading, isError, refetch, data: trip } = useTripDetail();

  if (isLoading) return <div className="p-6"><LoadingSkeleton rows={5} /></div>;
  if (isError || !trip) {
    return (
      <div className="p-6">
        <ErrorState message="Could not load. Try again." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-page pb-6">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7/trips" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div className="text-[20px] font-bold">டிரிப் · This trip</div>
      </header>

      <main className="space-y-3 px-5">
        <Step
          number={1}
          tone="go"
          icon={<MapPin className="size-7" />}
          ta="இங்கே ஏற்றவும்"
          en="Pick up from"
          value={trip.fromCity?.name ?? '—'}
          sub={formatPickupTime(trip.pickupAt)}
        />
        <Step
          number={2}
          tone="stop"
          icon={<Flag className="size-7" />}
          ta="இங்கே போக வேண்டும்"
          en="Drop here"
          value={trip.toCity?.name ?? '—'}
          sub={`${Math.round(trip.expectedDistanceKm)} km`}
        />
        <Step
          number={3}
          tone="wait"
          icon={<IndianRupee className="size-7" />}
          ta="நீங்கள் பெறுவது"
          en="You get paid"
          value={formatINR(trip.driverPayout)}
          sub="paid after the trip"
        />

        <article className="mt-2 flex items-center gap-3 rounded-card border-2 border-border bg-surface p-4">
          <Phone className="size-6 text-primary" />
          <div>
            <div className="text-[16px] font-semibold">பயணியை தொடர்பு கொள்ள</div>
            <div className="text-[13px] text-muted-foreground">Call the passenger after accepting</div>
          </div>
        </article>
      </main>

      <footer className="mt-6 space-y-2 px-5">
        <button
          type="button"
          className="h-16 w-full rounded-control bg-[var(--skin-simple-go)] text-[20px] font-bold text-white"
        >
          ✓ ஆம், செய்கிறேன் · Yes, I will do it
        </button>
        <button
          type="button"
          className="h-14 w-full rounded-control border-2 border-[var(--skin-simple-stop)] text-[17px] font-bold text-[var(--skin-simple-stop)]"
        >
          ✕ வேண்டாம் · No, refuse
        </button>
        <div className="rounded-card border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-3 text-center text-[14px]">
          <strong>பச்சை</strong> = ஆம் &nbsp;·&nbsp; <strong>சிவப்பு</strong> = வேண்டாம் <br />
          <span className="text-muted-foreground">Green = yes · Red = no</span>
        </div>
      </footer>
    </div>
  );
}

function Step({
  number, tone, icon, ta, en, value, sub,
}: {
  number: number;
  tone: 'go' | 'stop' | 'wait';
  icon: React.ReactNode;
  ta: string;
  en: string;
  value: string;
  sub: string;
}) {
  const tonePalette = {
    go: { border: 'var(--skin-simple-go)', bg: 'var(--skin-simple-go-bg)', text: 'var(--skin-simple-go)' },
    stop: { border: 'var(--skin-simple-stop)', bg: 'var(--skin-simple-stop-bg)', text: 'var(--skin-simple-stop)' },
    wait: { border: 'var(--skin-simple-wait)', bg: 'var(--skin-simple-wait-bg)', text: 'var(--skin-simple-wait)' },
  }[tone];

  return (
    <article
      className="flex items-center gap-3 rounded-card p-3"
      style={{ borderColor: tonePalette.border, borderWidth: 3, background: tonePalette.bg }}
    >
      <div
        className="grid size-14 shrink-0 place-items-center rounded-full text-white"
        style={{ background: tonePalette.text }}
      >
        <span className="text-[22px] font-bold">{number}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <span style={{ color: tonePalette.text }}>{icon}</span>
          {ta}
        </div>
        <div className="text-[12px] text-muted-foreground">{en}</div>
        <div className="mt-1 text-[20px] font-bold leading-tight">{value}</div>
        <div className="text-[12px] text-muted-foreground">{sub}</div>
      </div>
    </article>
  );
}

export default SimpleTripDetailPage;
