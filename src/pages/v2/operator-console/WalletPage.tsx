import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

export function OperatorWalletPage() {
  const query = useCashWallet();
  const b = query.data?.balance;
  const ledger = query.data?.recentLedger ?? [];

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold">Wallet</span>
      </header>
      {query.isLoading ? (
        <div className="p-3"><LoadingSkeleton rows={4} /></div>
      ) : query.isError ? (
        <div className="p-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : !b ? (
        <div className="p-3"><EmptyState title="No wallet" message="Not set up yet." /></div>
      ) : (
        <>
          <dl>
            <Row label="Total balance" value={formatINR(b.totalPaise / 100)} bold />
            <Row label="Cash (top-ups)" value={formatINR(b.cashPaise / 100)} />
            <Row label="Transferred (referrals)" value={formatINR(b.transferredPaise / 100)} />
            <Row label="Promo (credits)" value={formatINR(b.promoPaise / 100)} muted />
          </dl>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Recent ledger</div>
          {ledger.length === 0 ? (
            <div className="p-3 text-[12px] text-muted-foreground">No activity yet.</div>
          ) : (
            ledger.slice(0, 10).map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 py-2 text-[13px]">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.entryType.replace(/_/g, ' ')}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{e.subBalance}</div>
                </div>
                <div className={e.amountPaise >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-rose-600'}>
                  {e.amountPaise >= 0 ? '+' : ''}{formatINR(e.amountPaise / 100)}
                </div>
              </div>
            ))
          )}
          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-2">
            <button type="button" className="flex-1 rounded-control border border-border px-3 py-2 text-[13px]">Withdraw</button>
            <button type="button" className="flex-1 rounded-control bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground">Top up</button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[60%_40%] items-center gap-3 border-b border-border px-3 py-2 text-[13px]">
      <dt className={`text-[11px] uppercase tracking-wide ${muted ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{label}</dt>
      <dd className={`text-right ${bold ? 'text-[16px] font-bold' : ''} ${muted ? 'text-muted-foreground' : ''}`}>{value}</dd>
    </div>
  );
}

export default OperatorWalletPage;
