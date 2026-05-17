import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

export function PipelineWalletPage() {
  const query = useCashWallet();
  const b = query.data?.balance;
  const ledger = query.data?.recentLedger ?? [];

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-3">
      <header className="flex items-center gap-2">
        <Link to="/v4" aria-label="Back" className="rounded-control p-1">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">Wallet</h1>
      </header>
      {query.isLoading ? (
        <div className="mt-3"><LoadingSkeleton rows={3} /></div>
      ) : query.isError ? (
        <div className="mt-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <section className="mt-4 rounded-card bg-surface p-4 shadow-card">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total balance</div>
            <div className="mt-1 text-[28px] font-bold text-primary">
              {formatINR((b?.totalPaise ?? 0) / 100)}
            </div>
          </section>

          <section aria-label="Sub-balances" className="mt-4 grid grid-cols-3 gap-3">
            <Card tint="open" label="Cash" value={formatINR((b?.cashPaise ?? 0) / 100)} />
            <Card tint="assigned" label="Referral" value={formatINR((b?.transferredPaise ?? 0) / 100)} />
            <Card tint="has_applicants" label="Promo" value={formatINR((b?.promoPaise ?? 0) / 100)} />
          </section>

          {ledger.length > 0 ? (
            <section className="mt-5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recent activity</div>
              <div className="mt-2 space-y-2">
                {ledger.slice(0, 6).map((e) => (
                  <article key={e.id} className="rounded-card bg-surface p-3 shadow-card">
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-medium">{e.entryType.replace(/_/g, ' ')}</div>
                      <div className={`text-[14px] font-semibold ${e.amountPaise >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {e.amountPaise >= 0 ? '+' : ''}{formatINR(e.amountPaise / 100)}
                      </div>
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{e.subBalance}</div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Card({ tint, label, value }: { tint: string; label: string; value: string }) {
  return (
    <div data-tint={tint} className="rounded-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-[18px] font-bold leading-none">{value}</div>
    </div>
  );
}

export default PipelineWalletPage;
