import { useMemo } from 'react';
import { useReferralDashboard, useReferralEarnings } from '@/hooks/useReferral';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { formatINR } from '@/lib/utils';

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-2.5 ${tone ?? ''}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-900 tabular-nums">{value}</div>
      {sub ? <div className="text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function isoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

/**
 * The 7-figure earnings strip on `/referrals`:
 *   Today · This week · This month  (top row)
 *   Lifetime · Pending · Withdrawable · Withdrawn  (bottom row)
 *
 * Daily/weekly/monthly are derived client-side from the per-day series
 * returned by `GET /referrals/me/earnings`. The balance figures
 * (lifetime / pending / withdrawable / withdrawn) all come from the
 * server-computed `summary` block on `GET /referrals/me` — no client maths.
 */
export function EarningsStatsRow() {
  const dash = useReferralDashboard();
  const earnings = useReferralEarnings({ from: isoDay(30), to: isoDay(0) });

  const totals = useMemo(() => {
    const days = earnings.data?.days ?? [];
    const todayKey = isoDay(0);
    const weekStart = isoDay(6);
    let today = 0;
    let week = 0;
    let month = 0;
    for (const d of days) {
      month += d.paise;
      if (d.date >= weekStart) week += d.paise;
      if (d.date === todayKey) today += d.paise;
    }
    return { today, week, month };
  }, [earnings.data]);

  if (dash.isPending) return <LoadingSkeleton className="h-24" />;
  if (dash.isError || !dash.data) return null;

  const s = dash.data.summary;
  return (
    <div className="space-y-2" aria-label="Earnings summary">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Today" value={rupees(totals.today)} />
        <Stat label="This week" value={rupees(totals.week)} />
        <Stat label="This month" value={rupees(totals.month)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Lifetime" value={rupees(s.lifetimeEarnedPaise)} />
        <Stat label="Pending" value={rupees(s.pendingPaise)} sub="3-day hold" />
        <Stat
          label="Withdrawable"
          value={rupees(s.withdrawablePaise)}
          tone="bg-emerald-50/50 border-emerald-200"
        />
        <Stat label="Withdrawn" value={rupees(s.withdrawnPaise)} />
      </div>
    </div>
  );
}

export default EarningsStatsRow;
