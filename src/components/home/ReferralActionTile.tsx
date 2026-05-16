import { Gift, Copy, MessageCircle } from 'lucide-react';
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
 * Compact home-tab tile, sized to match the small HomeTile (h-20). Bundles:
 * - tap-to-/referrals (full surface)
 * - the referral code
 * - Copy + WhatsApp action buttons (small, inline)
 * Designed to sit in a `grid-cols-2` row alongside the Earnings/Analytics tile.
 */
export function ReferralActionTile({ role }: Props) {
  const { data, isLoading, isError } = useReferral(role);
  if (isLoading || isError || !data) return null;

  return (
    <div className="relative flex h-20 flex-col items-stretch gap-1 overflow-hidden rounded-xl border border-emerald-200 bg-white px-2 py-2 transition hover:border-emerald-300 hover:shadow-sm">
      {/* Tap target — full surface navigates; action buttons stopPropagation */}
      <Link to="/referrals" aria-label="View referrals" className="absolute inset-0" />

      <div className="z-10 flex items-center gap-1">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Gift className="size-3" aria-hidden />
        </div>
        <div className="flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-emerald-700">Referrals</div>
      </div>

      {/* Code + actions hugged together (no justify-between → buttons sit next to code) */}
      <div className="z-10 flex flex-1 items-center gap-1">
        <code className="shrink min-w-0 truncate font-mono text-xs font-bold tracking-wider text-slate-900">{data.code}</code>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); void copyText(data.code, 'Code'); }}
          aria-label="Copy referral code"
          className="z-10 inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95"
        >
          <Copy className="size-3" aria-hidden />
        </button>
        <a
          href={data.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Share via WhatsApp"
          className="z-10 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"
        >
          <MessageCircle className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}

export default ReferralActionTile;
