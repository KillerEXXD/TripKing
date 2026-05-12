import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyTripPoint } from '@/types';

export interface TripsMonthlyChartProps {
  /** The rolling ~6-month series (`trips_monthly` / `monthly`). */
  data: MonthlyTripPoint[];
  height?: number;
}

/** A small grouped bar chart of the last ~6 months — trips posted vs completed. */
export function TripsMonthlyChart({ data, height = 220 }: TripsMonthlyChartProps) {
  if (data.length === 0) return <p className="text-sm text-secondary">No monthly data yet.</p>;
  return (
    <div aria-label="Trips posted vs completed, by month" role="img">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="posted" name="Posted" fill="#6366f1" radius={[3, 3, 0, 0]} />
          <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TripsMonthlyChart;
