import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useReferralDashboard } from '@/hooks/useReferral';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

/**
 * v2 Pipeline — referrals as 4 status columns (the referral lifecycle).
 * Counts as the visual centerpiece; ledger below.
 */
export function PipelineReferralsPage() {
  const query = useReferralDashboard();
  const s = query.data?.summary;

  const COLS = [
    { tint: 'open',           label: 'Signed up',   value: s?.counts.signedUp ?? 0 },
    { tint: 'has_applicants', label: 'Verified',    value: s?.counts.verified ?? 0 },
    { tint: 'assigned',       label: 'Earning',     value: s?.counts.earningActive ?? 0 },
    { tint: 'completed',      label: 'Cap reached', value: s?.counts.capReached ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-3">
      <header className="flex items-center gap-2">
        <Link to="/v4" aria-label="Back" className="rounded-control p-1">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">Referrals</h1>
      </header>
      {query.isLoading ? (
        <div className="mt-3"><LoadingSkeleton rows={4} /></div>
      ) : query.isError ? (
        <div className="mt-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <section className="mt-4 rounded-card bg-surface p-4 shadow-card">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Withdrawable</div>
            <div className="mt-1 text-[26px] font-bold text-primary">
              {formatINR((s?.withdrawablePaise ?? 0) / 100)}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              of {formatINR((s?.lifetimeEarnedPaise ?? 0) / 100)} lifetime
            </div>
          </section>

          <section aria-label="Referral pipeline" className="mt-4 grid grid-cols-2 gap-3">
            {COLS.map((c) => (
              <div key={c.label} data-tint={c.tint} className="rounded-card p-4">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <div className="mt-1 text-[24px] font-bold leading-none">{c.value}</div>
              </div>
            ))}
          </section>

          <div className="mt-5 rounded-card bg-surface p-3 shadow-card">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Your code</div>
            <div className="mt-0.5 text-[20px] font-semibold tracking-wider">RAVEE-X91Z</div>
          </div>
        </>
      )}
    </div>
  );
}

export default PipelineReferralsPage;
