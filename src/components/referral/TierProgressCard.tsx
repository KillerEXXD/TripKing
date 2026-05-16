import { Trophy } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useReferralDashboard, useReferralTiers } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';
import type { ReferralTier } from '@/types';

function rupees(paise: number | null): string {
  if (paise === null) return 'configurable';
  return formatINR(Math.round(paise / 100));
}

function rangeLabel(t: ReferralTier): string {
  return t.maxQualifiedReferrals === null
    ? `${t.minQualifiedReferrals}+`
    : `${t.minQualifiedReferrals}–${t.maxQualifiedReferrals}`;
}

function capShortLabel(t: ReferralTier): string {
  if (t.capPaise === null) return 'cfg';
  const rupees = t.capPaise / 100;
  return rupees >= 1000 ? `₹${(rupees / 1000).toFixed(1)}k` : `₹${rupees}`;
}

/**
 * Tier-progress card — shows current tier, progress bar to the next tier,
 * and the full tier ladder reference. Tier rows come from `referral_tiers`
 * (admin-managed); current tier is derived from the qualified-referral
 * count on `summary.counts` — the same number the backend uses to
 * compute per-link caps in `apply_referral_tier()`.
 */
export function TierProgressCard() {
  const tiersQ = useReferralTiers();
  const dashQ = useReferralDashboard();

  if (tiersQ.isPending || dashQ.isPending) return <LoadingSkeleton className="h-32" />;
  if (tiersQ.isError) {
    return <ErrorState title="Couldn't load tiers" message="Try again." onRetry={() => void tiersQ.refetch()} />;
  }
  if (dashQ.isError || !dashQ.data || !tiersQ.data) {
    return <ErrorState title="Couldn't load tier progress" message="Try again." onRetry={() => void dashQ.refetch()} />;
  }

  const tiers = [...tiersQ.data].sort((a, b) => a.sortOrder - b.sortOrder);
  if (tiers.length === 0) return null;

  const qualified = dashQ.data.summary.counts.qualified
    + dashQ.data.summary.counts.earningActive
    + dashQ.data.summary.counts.capReached;

  // Current tier = highest tier whose min ≤ qualified; if none, the first tier.
  const currentIdx = (() => {
    let idx = 0;
    for (let i = 0; i < tiers.length; i++) {
      if (qualified >= tiers[i].minQualifiedReferrals) idx = i;
    }
    return idx;
  })();
  const current = tiers[currentIdx];
  const next = tiers[currentIdx + 1];

  const min = current.minQualifiedReferrals;
  const max = current.maxQualifiedReferrals ?? Math.max(qualified, min);
  const span = Math.max(1, max - min + 1);
  const progress = Math.min(100, Math.max(0, ((qualified - min + 1) / span) * 100));

  return (
    <section aria-label="Tier progress" className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
      <div className="flex items-center gap-2 text-emerald-800">
        <Trophy size={18} aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide">Current tier</span>
      </div>
      <div className="mt-1 text-xl font-extrabold text-slate-900">
        {current.slotName} · {current.capPaise === null ? 'Configurable cap' : `${rupees(current.capPaise)} cap`}
      </div>
      <div className="text-xs text-slate-500">
        <b>{qualified}</b> qualified referrals
        {next ? (
          <>
            {' — '}
            <b>{Math.max(0, (current.maxQualifiedReferrals ?? max) - qualified)}</b> more to unlock {next.slotName} ({rupees(next.capPaise)} cap)
          </>
        ) : null}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto text-[10px]">
        {tiers.map((t, i) => (
          <div
            key={t.id}
            className={`flex-none rounded-lg border px-2 py-1.5 text-center ${
              i === currentIdx ? 'border-emerald-400 bg-emerald-100 text-emerald-900' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <div className="font-bold">{t.slotName}</div>
            <div className="text-[9px]">{rangeLabel(t)}</div>
            <div className="text-[9px] font-semibold">{capShortLabel(t)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default TierProgressCard;
