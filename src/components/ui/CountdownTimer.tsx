import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Live countdown to an ISO deadline. Re-renders every second; renders "Expired"
 * once the deadline has passed. Used by the two-step-handshake banners
 * (SelectedDriverCard + AwaitingAcceptanceBanner) so both sides can SEE the
 * clock running down.
 *
 * The component does NOT trigger the expiry — the server cron does that. This
 * just visualises the remaining time; when the server flips status away from
 * `selected`, React Query's poll picks it up within ~5 s and the parent stops
 * rendering this timer altogether.
 *
 *   <CountdownTimer deadline={trip.acceptanceDeadlineAt} />        // "12:34"
 *   <CountdownTimer deadline={trip.acceptanceDeadlineAt} expiredLabel="Expired" />
 */
export interface CountdownTimerProps {
  /** ISO timestamp the timer counts down to. Falsy → renders nothing. */
  deadline?: string | null;
  /** Text shown when the deadline has elapsed. Default `'Expired'`. */
  expiredLabel?: string;
  /** Prefix shown before the timer when there's still time left, e.g. `"Accept within"`. */
  prefix?: string;
  /** Tailwind className for the wrapping `<span>`. */
  className?: string;
  /** Extra Tailwind for the timer text once it's in the "last minute" warning state. */
  warningClassName?: string;
}

function formatRemaining(msLeft: number): string {
  if (msLeft <= 0) return '0:00';
  const total = Math.floor(msLeft / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function CountdownTimer({ deadline, expiredLabel = 'Expired', prefix, className, warningClassName = 'text-red-700' }: CountdownTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const deadlineMs = Date.parse(deadline);
  if (!Number.isFinite(deadlineMs)) return null;
  const msLeft = deadlineMs - now;
  if (msLeft <= 0) {
    return (
      <span className={cn('tabular-nums', warningClassName, className)} aria-live="polite">
        {expiredLabel}
      </span>
    );
  }
  const inWarning = msLeft < 60_000; // last 60 seconds
  return (
    <span
      className={cn('tabular-nums', inWarning && warningClassName, className)}
      aria-live="polite"
    >
      {prefix ? <>{prefix} </> : null}
      <span className="font-semibold">{formatRemaining(msLeft)}</span>
    </span>
  );
}

export default CountdownTimer;
