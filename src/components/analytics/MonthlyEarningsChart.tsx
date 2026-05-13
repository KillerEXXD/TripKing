import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR } from '@/lib/utils';
import type { MonthlyEarningsPoint } from '@/types';

export interface MonthlyEarningsChartProps {
  /** A driver's rolling ~6-month series — ₹ earned (driver_payout over completed trips) per month. */
  data: MonthlyEarningsPoint[];
  height?: number;
}

const inr = (v: unknown) => formatINR(typeof v === 'number' ? v : Number(v ?? 0));

/** A small bar chart of a driver's monthly earnings (₹) over the last ~6 months. */
export function MonthlyEarningsChart({ data, height = 220 }: MonthlyEarningsChartProps) {
  if (data.length === 0 || data.every((p) => p.earnings === 0)) return <p className="text-sm text-secondary">No earnings yet.</p>;
  return (
    <div aria-label="Earnings by month" role="img">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={inr} tick={{ fontSize: 11 }} width={64} />
          <Tooltip formatter={(v): [string, string] => [inr(v), 'Earned']} />
          <Bar dataKey="earnings" name="Earned" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default MonthlyEarningsChart;
