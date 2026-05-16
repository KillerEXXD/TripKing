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
 * Compact home-tab tile that bundles: tap-to-/referrals + the referral code +
 * Copy + WhatsApp actions inline. Sits in the home tile row beside the
 * Earnings/Analytics tile. Hidden while the code is loading or unavailable.
 */
export function ReferralActionTile({ role }: Props) {
  const { data, isLoading, isError } = useReferral(role);
  if (isLoading || isError || !data) return null;

  return (
    <div className="relative flex h-20 items-center gap-2 overflow-hidden rounded-xl border border-emerald-200 bg-white px-2 py-2 transition hover:border-emerald-300 hover:shadow-sm">
      {/* Tap target — full surface navigates to /referrals; action buttons stop propagation */}
      <Link to="/referrals" aria-label="View referrals" className="absolute inset-0" />

      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Gift className="size-4" aria-hidden />
      </div>

      <div className="z-10 flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Referrals</div>
        <code className="block max-w-full truncate font-mono text-xs font-bold tracking-wider text-slate-900">{data.code}</code>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); void copyText(data.code, 'Code'); }}
        aria-label="Copy referral code"
        className="z-10 inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95"
      >
        <Copy className="size-4" aria-hidden />
      </button>
      <a
        href={data.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Share via WhatsApp"
        className="z-10 inline-flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"
      >
        <MessageCircle className="size-4" aria-hidden />
      </a>
    </div>
  );
}

export default ReferralActionTile;
