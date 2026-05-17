import { Link } from 'react-router-dom';
import { ChevronLeft, Copy } from 'lucide-react';
import { useReferralDashboard } from '@/hooks/useReferral';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

export function OperatorReferralsPage() {
  const query = useReferralDashboard();
  const s = query.data?.summary;
  const ledger = query.data?.recentLedger ?? [];

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold">Referrals</span>
      </header>
      {query.isLoading ? (
        <div className="p-3"><LoadingSkeleton rows={5} /></div>
      ) : query.isError ? (
        <div className="p-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : !s ? (
        <div className="p-3"><EmptyState title="Not enrolled" message="No referral activity yet." /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 border-b border-border">
            <Stat label="Lifetime" value={formatINR(s.lifetimeEarnedPaise / 100)} />
            <Stat label="Withdrawable" value={formatINR(s.withdrawablePaise / 100)} accent />
            <Stat label="Pending" value={formatINR(s.pendingPaise / 100)} />
            <Stat label="Withdrawn" value={formatINR(s.withdrawnPaise / 100)} />
          </div>
          <div className="grid grid-cols-3 border-b border-border">
            <Stat label="Referred" value={String(s.counts.totalReferred)} small />
            <Stat label="Qualified" value={String(s.counts.qualified)} small />
            <Stat label="Earning" value={String(s.counts.earningActive)} small />
          </div>
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-2">
            <span className="font-mono text-[13px]">RAVEE-X91Z</span>
            <button type="button" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-primary">
              <Copy className="size-3" /> Copy code
            </button>
          </div>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Recent ledger</div>
          {ledger.length === 0 ? (
            <div className="p-3 text-[12px] text-muted-foreground">No earnings yet.</div>
          ) : (
            ledger.slice(0, 8).map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 py-2 text-[13px]">
                <div className="min-w-0 truncate">{e.entryType.replace(/_/g, ' ')}</div>
                <div className={e.amountPaise >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-rose-600'}>
                  {e.amountPaise >= 0 ? '+' : ''}{formatINR(e.amountPaise / 100)}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="border-b border-r border-border p-3 last:border-r-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 ${small ? 'text-[14px]' : 'text-[18px]'} font-semibold ${accent ? 'text-emerald-600' : ''}`}>
        {value}
      </div>
    </div>
  );
}

export default OperatorReferralsPage;
