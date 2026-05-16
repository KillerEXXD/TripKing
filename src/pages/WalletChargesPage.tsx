import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Receipt } from 'lucide-react';
import { useCashWalletLedger } from '@/hooks/useCashWallet';
import { Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { CashWalletLedgerEntry } from '@/types';

function rupees(paise: number): string {
  return formatINR(Math.round(Math.abs(paise) / 100));
}

function ChargeRow({ e }: { e: CashWalletLedgerEntry }) {
  const date = new Date(e.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const sourceLabel = e.paymentSource ? e.paymentSource.replace(/_/g, ' ') : 'wallet';
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-rose-100">
      <div className="flex min-w-0 items-center gap-2">
        <ArrowUpRight className="size-4 text-rose-600" aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{e.note || 'Platform fee'}</div>
          <div className="text-[11px] text-secondary">
            {date} · {sourceLabel}
            {e.referenceType === 'trip' && e.referenceId ? (
              <> · <Link to={`/trips/${e.referenceId}`} className="font-medium text-primary underline">trip</Link></>
            ) : null}
          </div>
        </div>
      </div>
      <div className="text-sm font-semibold tabular-nums text-rose-700">−{rupees(e.amountPaise)}</div>
    </li>
  );
}

/**
 * `/wallet/charges` — Stage 3: receipts page showing every platform-fee debit
 * from this user's wallet (their own side only — the API is per-user). Pulls
 * the existing ledger and filters to `fee_debit` entries client-side.
 */
export function WalletChargesPage() {
  const q = useCashWalletLedger({ limit: 100 });
  const charges = (q.data ?? []).filter((e) => e.entryType === 'fee_debit');

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/wallet" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Wallet
      </Link>
      <h1 className="text-2xl font-bold">Platform-fee charges</h1>

      {q.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your charges" message="Check your connection and try again." onRetry={() => void q.refetch()} />
      ) : charges.length === 0 ? (
        <EmptyState icon={<Receipt className="size-7" />} title="No charges yet" message="Platform fees are charged when a trip you're on completes." />
      ) : (
        <Card className="gap-2">
          <ul className="space-y-1.5">
            {charges.map((e) => <ChargeRow key={e.id} e={e} />)}
          </ul>
        </Card>
      )}
    </main>
  );
}

export default WalletChargesPage;
