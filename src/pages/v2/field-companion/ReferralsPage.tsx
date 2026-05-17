import { Link } from 'react-router-dom';
import { ChevronLeft, Share2, Users } from 'lucide-react';
import { useReferralDashboard } from '@/hooks/useReferral';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import { StickyCtaBar } from '@/components/v2/field-companion/StickyCtaBar';

export function FieldReferralsPage() {
  const query = useReferralDashboard();
  const s = query.data?.summary;

  return (
    <div className="min-h-dvh pb-32">
      <header className="flex items-center gap-3 px-5 pt-4">
        <Link to="/v3" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[22px] font-bold">Bring friends</h1>
      </header>

      {query.isLoading ? (
        <div className="px-5 pt-6"><LoadingSkeleton rows={3} /></div>
      ) : query.isError ? (
        <div className="px-5 pt-6"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <section className="mx-5 mt-6 rounded-card bg-surface p-6 text-center shadow-card">
            <div className="text-[14px] uppercase tracking-wide text-muted-foreground">Lifetime earned</div>
            <div className="mt-2 text-[56px] font-bold leading-none">{formatINR((s?.lifetimeEarnedPaise ?? 0) / 100)}</div>
            <div className="mt-3 text-[15px] text-muted-foreground">
              from {s?.counts.totalReferred ?? 0} {s?.counts.totalReferred === 1 ? 'friend' : 'friends'}
            </div>
          </section>

          <section className="mx-5 mt-3 grid grid-cols-2 gap-3">
            <Tile label="Withdrawable" value={formatINR((s?.withdrawablePaise ?? 0) / 100)} accent />
            <Tile label="Pending" value={formatINR((s?.pendingPaise ?? 0) / 100)} />
          </section>

          <section className="mx-5 mt-4 rounded-card bg-surface p-5 shadow-card">
            <div className="text-[12px] uppercase tracking-wide text-muted-foreground">Your code</div>
            <div className="mt-1 text-[28px] font-bold tracking-wider">RAVEE-X91Z</div>
          </section>

          <section className="mx-5 mt-3 flex items-center gap-3 rounded-card bg-surface p-5 shadow-card">
            <div className="grid size-12 place-items-center rounded-pill bg-primary/15 text-primary">
              <Users className="size-6" />
            </div>
            <div>
              <div className="text-[16px] font-semibold">Earn ₹100 per friend</div>
              <div className="text-[13px] text-muted-foreground">…once they finish 5 paid trips</div>
            </div>
          </section>
        </>
      )}

      <StickyCtaBar>
        <button
          type="button"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-[17px] font-semibold text-primary-foreground shadow-fab"
        >
          <Share2 className="size-5" /> Share my code
        </button>
      </StickyCtaBar>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[20px] font-bold ${accent ? 'text-primary' : ''}`}>{value}</div>
    </div>
  );
}

export default FieldReferralsPage;
