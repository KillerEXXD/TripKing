import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useAdminWithdrawals, usePatchAdminWithdrawal } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';
import type { Withdrawal, WithdrawalStatus } from '@/types';

const STATUS_FILTERS: (WithdrawalStatus | 'all')[] = ['all', 'requested', 'approved', 'processing', 'paid', 'rejected', 'cancelled', 'failed'];

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function Row({ w, onPatch, busy }: { w: Withdrawal; onPatch: (outcome: 'approved' | 'paid' | 'rejected', extra?: Record<string, string>) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  const [txn, setTxn] = useState('');
  const isTerminal = w.status === 'paid' || w.status === 'rejected' || w.status === 'cancelled' || w.status === 'failed';
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-2 py-2">
        <div className="text-sm font-medium">{w.user?.displayName ?? '—'}</div>
        <div className="text-[11px] text-secondary">{w.user?.phone ?? ''} · {w.user?.role ?? ''}</div>
      </td>
      <td className="px-2 py-2 font-mono text-sm">{w.upiId}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{rupees(w.amountPaise)}</td>
      <td className="px-2 py-2 text-xs uppercase">{w.status}</td>
      <td className="px-2 py-2 text-[11px] text-secondary">{new Date(w.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
      <td className="px-2 py-2">
        {isTerminal ? (
          <span className="text-xs text-secondary">{w.rejectedReason || w.externalTxnRef || '—'}</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {w.status === 'requested' ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onPatch('approved')}>Approve</Button>
            ) : null}
            {(w.status === 'approved' || w.status === 'processing') ? (
              <div className="flex gap-1">
                <input type="text" placeholder="UTR / txn ref" value={txn} onChange={(e) => setTxn(e.target.value)} className="w-32 rounded-md border border-input bg-background px-2 py-1 text-xs" />
                <Button type="button" size="sm" disabled={busy} onClick={() => onPatch('paid', txn ? { externalTxnRef: txn } : undefined)}>Mark paid</Button>
              </div>
            ) : null}
            <div className="flex gap-1">
              <input type="text" placeholder="Reject reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-32 rounded-md border border-input bg-background px-2 py-1 text-xs" />
              <Button type="button" size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => onPatch('rejected', { rejectedReason: reason.trim() })}>Reject</Button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * `/administration/withdrawals` (Stage 7) — admin queue. Filter by status,
 * approve / mark paid (with UTR) / reject (with reason). Razorpay payout
 * automation arrives later — today admins manage payouts manually.
 */
export function AdminWithdrawalsPage() {
  const [filter, setFilter] = useState<WithdrawalStatus | 'all'>('requested');
  const params = filter === 'all' ? undefined : { status: filter };
  const q = useAdminWithdrawals(params);
  const patch = usePatchAdminWithdrawal();

  async function onPatch(id: string, outcome: 'approved' | 'paid' | 'rejected', extra?: Record<string, string>) {
    try {
      await patch.mutateAsync({ id, patch: { outcome, ...extra } });
      toast.success(`Withdrawal ${outcome}`);
    } catch {}
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <Link to="/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">Withdrawals</h1>

      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-current={filter === s ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-xs uppercase ${filter === s ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'}`}
          >
            {s}
          </button>
        ))}
      </nav>

      {q.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load withdrawals" message="Try again." onRetry={() => void q.refetch()} />
      ) : (
        <Card className="gap-2">
          {q.data.length === 0 ? (
            <p className="text-sm text-secondary">No withdrawals match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-secondary">
                    <th className="px-2 py-1.5">User</th>
                    <th className="px-2 py-1.5">UPI</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Requested</th>
                    <th className="px-2 py-1.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((w) => (
                    <Row key={w.id} w={w} busy={patch.isPending} onPatch={(outcome, extra) => void onPatch(w.id, outcome, extra)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </main>
  );
}

export default AdminWithdrawalsPage;
