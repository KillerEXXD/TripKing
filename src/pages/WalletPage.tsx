import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Gift, IndianRupee, Plus, Wallet } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { AddMoneyModal } from '@/components/wallet/AddMoneyModal';
import { Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { CashWalletBalance, CashWalletLedgerEntry, CashWalletSubBalance } from '@/types';

const SUB_BALANCE_LABELS: Record<CashWalletSubBalance, string> = {
  promo: 'Launch credit',
  cash: 'Real money',
  transferred: 'From referrals',
};

const SUB_BALANCE_TINT: Record<CashWalletSubBalance, string> = {
  promo: 'bg-amber-50 text-amber-900 ring-amber-200',
  cash: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  transferred: 'bg-sky-50 text-sky-900 ring-sky-200',
};

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function BalanceCard({ b, onAdd }: { b: CashWalletBalance; onAdd: () => void }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
            <Wallet className="size-3.5" aria-hidden /> Total balance
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">{rupees(b.totalPaise)}</div>
        </div>
        <Button type="button" size="sm" onClick={onAdd}>
          <Plus className="mr-1 size-4" aria-hidden /> Add money
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SubBalance kind="promo" label={SUB_BALANCE_LABELS.promo} icon={<Gift className="size-3.5" />} paise={b.promoPaise} />
        <SubBalance kind="cash" label={SUB_BALANCE_LABELS.cash} icon={<IndianRupee className="size-3.5" />} paise={b.cashPaise} />
        <SubBalance kind="transferred" label={SUB_BALANCE_LABELS.transferred} icon={<ArrowDownRight className="size-3.5" />} paise={b.transferredPaise} />
      </div>
    </Card>
  );
}

function SubBalance({ kind, label, icon, paise }: { kind: CashWalletSubBalance; label: string; icon: React.ReactNode; paise: number }) {
  return (
    <div className={`rounded-xl px-2.5 py-2 ring-1 ${SUB_BALANCE_TINT[kind]}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{rupees(paise)}</div>
    </div>
  );
}

function entryDirectionIcon(amountPaise: number) {
  return amountPaise >= 0
    ? <ArrowDownRight className="size-4 text-emerald-600" aria-label="credit" />
    : <ArrowUpRight className="size-4 text-rose-600" aria-label="debit" />;
}

function describeEntry(e: CashWalletLedgerEntry): string {
  if (e.note) return e.note;
  switch (e.entryType) {
    case 'topup': return 'Top-up';
    case 'fee_debit': return 'Platform fee';
    case 'refund': return 'Refund';
    case 'transfer_in_from_referral': return 'Referral transfer';
    case 'promo_credit_grant': return 'Launch credit';
    case 'adjustment': return 'Adjustment';
  }
}

function LedgerRow({ e }: { e: CashWalletLedgerEntry }) {
  const sign = e.amountPaise >= 0 ? '+' : '−';
  return (
    <li className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ${SUB_BALANCE_TINT[e.subBalance]}`}>
      <div className="flex min-w-0 items-center gap-2">
        {entryDirectionIcon(e.amountPaise)}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{describeEntry(e)}</div>
          <div className="text-[11px] opacity-70">{SUB_BALANCE_LABELS[e.subBalance]} · {new Date(e.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
        </div>
      </div>
      <div className="text-sm font-semibold tabular-nums">
        {sign}{rupees(Math.abs(e.amountPaise))}
      </div>
    </li>
  );
}

/**
 * `/wallet` — Stage 2 cash wallet. Shows the three sub-balances (Launch credit / Real money / From referrals),
 * an "Add money" Razorpay flow (stubbed until credentials land), and the recent ledger.
 */
export function WalletPage() {
  const [showAdd, setShowAdd] = useState(false);
  const q = useCashWallet();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Your wallet</h1>

      {q.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your wallet" message="Check your connection and try again." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <BalanceCard b={q.data.balance} onAdd={() => setShowAdd(true)} />

          <Card className="gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Recent activity</div>
              <Link to="/wallet/charges" className="text-xs font-medium text-primary hover:underline">Platform-fee charges →</Link>
            </div>
            {q.data.recentLedger.length === 0 ? (
              <p className="text-sm text-secondary">No activity yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {q.data.recentLedger.map((e) => <LedgerRow key={e.id} e={e} />)}
              </ul>
            )}
          </Card>
        </>
      )}

      {showAdd ? <AddMoneyModal onClose={() => setShowAdd(false)} /> : null}
    </main>
  );
}

export default WalletPage;
