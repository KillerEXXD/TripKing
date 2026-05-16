import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useReferralEarnings } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';

type RangeKey = '7d' | '30d' | '90d';
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
];

function isoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

const rupees = (paise: unknown) => formatINR(Math.round((typeof paise === 'number' ? paise : Number(paise ?? 0)) / 100));

/**
 * Stage 8 — daily bar chart of referral accruals. Default last 30 days,
 * pickable 7 / 30 / 90. Hover tooltip = trips count + ₹ earned.
 */
export function EarningsTimelineChart() {
  const [range, setRange] = useState<RangeKey>('30d');
  const days = RANGES.find((r) => r.key === range)?.days ?? 30;
  const params = { from: isoDay(days), to: isoDay(0) };
  const q = useReferralEarnings(params);

  return (
    <Card aria-label="Earnings timeline">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Earnings timeline</div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-current={range === r.key ? 'true' : undefined}
              className={`rounded-full px-2.5 py-0.5 text-[11px] ${range === r.key ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {q.isPending ? (
        <LoadingSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load earnings" message="Try again." onRetry={() => void q.refetch()} />
      ) : q.data.days.length === 0 ? (
        <p className="text-sm text-secondary">No accruals in this range yet.</p>
      ) : (
        <div role="img" aria-label="Daily referral earnings">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={q.data.days} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={rupees} tick={{ fontSize: 10 }} width={56} />
              <Tooltip
                formatter={(v: unknown, name): [string, string] =>
                  name === 'paise' ? [rupees(v), 'Earned'] : [String(v), 'Trips']
                }
                labelFormatter={(l) => String(l)}
              />
              <Bar dataKey="paise" name="paise" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
