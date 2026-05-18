import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowLeft, Wallet } from 'lucide-react';
import { useAppWallet } from '@/hooks/useAdminStage5';
import { Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

function rupees(paise: number): string {
  return formatINR(Math.round(Math.abs(paise) / 100));
}

/**
 * `/app/administration/app-wallet` (Stage 5) — admin-only read of the platform's
 * accounts-receivable wallet. Read-only; refunds happen via the documented
 * support flows, not from this view.
 */
export function AdminAppWalletPage() {
  const q = useAppWallet(200);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <Link to="/app/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">App wallet</h1>

      {q.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load app wallet" message="Try again." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Wallet className="size-5" aria-hidden />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-secondary">Total balance</div>
                <div className="text-3xl font-bold tabular-nums">{rupees(q.data.balance.totalPaise)}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-emerald-50 px-2 py-2 ring-1 ring-emerald-200">
                <div className="text-base font-semibold tabular-nums">{rupees(q.data.balance.lifetimeCollectedPaise)}</div>
                <div className="text-secondary">Lifetime collected</div>
              </div>
              <div className="rounded-xl bg-rose-50 px-2 py-2 ring-1 ring-rose-200">
                <div className="text-base font-semibold tabular-nums">{rupees(q.data.balance.lifetimeRefundedPaise)}</div>
                <div className="text-secondary">Lifetime refunded</div>
              </div>
              <div className="rounded-xl bg-muted/50 px-2 py-2 ring-1 ring-input">
                <div className="text-base font-semibold tabular-nums">{q.data.balance.entries}</div>
                <div className="text-secondary">Ledger entries</div>
              </div>
            </div>
          </Card>

          <Card className="gap-2">
            <div className="text-sm font-semibold">Recent activity</div>
            {q.data.ledger.length === 0 ? (
              <p className="text-sm text-secondary">No entries.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-secondary">
                      <th className="px-2 py-1.5">When</th>
                      <th className="px-2 py-1.5">Type</th>
                      <th className="px-2 py-1.5">Side</th>
                      <th className="px-2 py-1.5">Source</th>
                      <th className="px-2 py-1.5">Trip</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.ledger.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5 text-xs text-secondary">{new Date(e.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-2 py-1.5">{e.entryType}</td>
                        <td className="px-2 py-1.5 capitalize">{e.fee?.side ?? '—'}</td>
                        <td className="px-2 py-1.5">{e.fee?.paymentSource ? e.fee.paymentSource.replace(/_/g, ' ') : '—'}</td>
                        <td className="px-2 py-1.5">{e.fee?.tripId ? <Link to={`/app/trips/${e.fee.tripId}`} className="text-primary underline">trip</Link> : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          <span className={e.amountPaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            <ArrowDownRight className="mr-0.5 inline size-3.5" aria-hidden />
                            {e.amountPaise >= 0 ? '+' : '−'}{rupees(e.amountPaise)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </main>
  );
}

export default AdminAppWalletPage;
