import { Gift, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useReferral, type ReferralRole } from '@/hooks/useReferral';

interface Props { role: ReferralRole }

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy — long-press to copy manually");
  }
}

/**
 * Compact home-tab tile, sized to match the small HomeTile (h-20).
 * The whole tile is a single Link to /referrals; the Copy button uses
 * stopPropagation + preventDefault to capture its own click without navigating.
 */
export function ReferralActionTile({ role }: Props) {
  const { data, isLoading, isError } = useReferral(role);
  if (isLoading || isError || !data) return null;

  return (
    <Link
      to="/referrals"
      aria-label="View referrals"
      className="flex h-20 flex-col items-stretch gap-1 rounded-xl border border-emerald-200 bg-white px-2 py-2 transition hover:border-emerald-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-1">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Gift className="size-3" aria-hidden />
        </div>
        <div className="flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-emerald-700">Referrals</div>
      </div>

      {/* Code + Copy hugged together */}
      <div className="flex flex-1 items-center gap-1">
        <code className="shrink min-w-0 truncate font-mono text-xs font-bold tracking-wider text-slate-900">{data.code}</code>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); void copyText(data.code, 'Code'); }}
          aria-label="Copy referral code"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95"
        >
          <Copy className="size-3" aria-hidden />
        </button>
      </div>
    </Link>
  );
}

export default ReferralActionTile;
