import { useState } from 'react';
import { Bug } from 'lucide-react';
import { toast } from 'sonner';
import { useSetCanReportBugs } from '@/hooks/useBugReports';

/**
 * Admin per-user toggle for `users.can_report_bugs`. Optimistic — flips
 * locally on click so the affordance stays responsive, then reverts on
 * mutation failure. The initial state comes from `initial` (the driver /
 * agent admin GETs surface `canReportBugs` so the toggle is truthful);
 * defaults to `false` for callsites that don't yet have it.
 */
export interface BugReporterToggleProps {
  userId: string;
  initial?: boolean;
  className?: string;
}

export function BugReporterToggle({ userId, initial = false, className }: BugReporterToggleProps) {
  const [on, setOn] = useState(initial);
  const mut = useSetCanReportBugs();

  async function flip() {
    const next = !on;
    setOn(next);
    try {
      await mut.mutateAsync({ userId, value: next });
      toast.success(next ? 'Bug reporting enabled' : 'Bug reporting disabled');
    } catch (err) {
      setOn(!next);
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Bug reporter (${on ? 'on' : 'off'})`}
      disabled={mut.isPending}
      onClick={() => void flip()}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-input bg-background text-secondary'} ${className ?? ''}`}
    >
      <Bug className="size-3" aria-hidden />
      {on ? 'Reporter on' : 'Reporter off'}
    </button>
  );
}

export default BugReporterToggle;
