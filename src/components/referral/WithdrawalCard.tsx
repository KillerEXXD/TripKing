import { useState } from 'react';
import { Banknote, Clock, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { useMyWithdrawals, useReferralDashboard, useRequestWithdrawal } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';
import type { WithdrawalStatus } from '@/types';

const PRESET_RUPEES = [100, 250, 500, 1000];

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function statusLabel(s: WithdrawalStatus): string {
  switch (s) {
    case 'requested': return 'Requested';
    case 'approved': return 'Approved';
    case 'processing': return 'Processing';
    case 'paid': return 'Paid';
    case 'rejected': return 'Rejected';
    case 'cancelled': return 'Cancelled';
    case 'failed': return 'Failed';
  }
}

const STATUS_TINT: Record<WithdrawalStatus, string> = {
  requested: 'bg-amber-50 text-amber-900 ring-amber-200',
  approved: 'bg-sky-50 text-sky-900 ring-sky-200',
  processing: 'bg-sky-50 text-sky-900 ring-sky-200',
  paid: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-900 ring-rose-200',
  cancelled: 'bg-muted/50 text-secondary ring-input',
  failed: 'bg-rose-50 text-rose-900 ring-rose-200',
};

/**
 * Stage 7 — request a UPI payout against the withdrawable balance, and see
 * past withdrawals + their state.
 */
export function WithdrawalCard() {
  const dash = useReferralDashboard();
  const list = useMyWithdrawals();
  const request = useRequestWithdrawal();

  const withdrawable = dash.data?.summary.withdrawablePaise ?? 0;
  // ₹500 minimum per spec §22 / WITHDRAW_LIMITS.minWithdrawalRupees.
  const minRupees = 500;
  const maxRupees = Math.floor(withdrawable / 100);
  const belowMin = maxRupees < minRupees;

  const [amount, setAmount] = useState<number>(0);
  const [upi, setUpi] = useState<string>('');
  const isValid = amount >= minRupees && amount <= maxRupees && upi.includes('@');

  async function onConfirm() {
    if (!isValid) return;
    try {
      const result = await request.mutateAsync({ amountPaise: amount * 100, upiId: upi.trim() });
      toast.success(`Withdrawal requested — ${formatINR(amount)} to ${upi.trim()}`);
      setAmount(0);
      setUpi('');
      void result;
    } catch {
      // global mutation funnel toasts error reason
    }
  }

  return (
    <Card aria-label="Withdraw to UPI">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Banknote className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Withdraw to UPI</div>
          <div className="text-xs text-secondary">
            Withdrawable balance: <span className="font-semibold text-foreground">{rupees(withdrawable)}</span>
          </div>
        </div>
      </div>

      {belowMin ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Minimum withdrawal is {formatINR(minRupees)}. You currently have <b>{rupees(withdrawable)}</b> released — keep referring to top up.
        </div>
      ) : null}

      <label className="block text-sm font-medium">
        Amount (₹)
        <input
          type="number"
          inputMode="numeric"
          min={minRupees}
          max={maxRupees}
          value={amount || ''}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          disabled={belowMin}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="mt-1 block text-xs text-secondary">Min {formatINR(minRupees)} · 3-day hold after each accrual</span>
      </label>

      <div className="flex flex-wrap gap-2">
        {PRESET_RUPEES.filter((p) => p <= maxRupees).map((p) => (
          <Button key={p} type="button" variant={amount === p ? 'default' : 'outline'} size="sm" onClick={() => setAmount(p)}>
            {formatINR(p)}
          </Button>
        ))}
        {maxRupees > 0 ? (
          <Button type="button" variant={amount === maxRupees ? 'default' : 'outline'} size="sm" onClick={() => setAmount(maxRupees)}>
            All
          </Button>
        ) : null}
      </div>

      <label className="block text-sm font-medium">
        UPI ID
        <input
          type="text"
          inputMode="email"
          autoComplete="off"
          placeholder="you@upi"
          value={upi}
          onChange={(e) => setUpi(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
      </label>

      <Button type="button" variant="full" onClick={() => void onConfirm()} disabled={!isValid || request.isPending}>
        {request.isPending ? 'Requesting…' : `Request ${rupees(amount * 100)}`}
      </Button>

      <div className="border-t pt-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
          <Receipt className="size-3.5" aria-hidden /> Recent withdrawals
        </div>
        {list.isPending ? (
          <p className="text-sm text-secondary">Loading…</p>
        ) : list.data && list.data.length > 0 ? (
          <ul className="space-y-1.5">
            {list.data.slice(0, 5).map((w) => (
              <li key={w.id} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-sm ring-1 ${STATUS_TINT[w.status]}`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{rupees(w.amountPaise)} · {w.upiId}</div>
                  <div className="text-[11px] opacity-70">
                    <Clock className="mr-0.5 inline size-3" aria-hidden />
                    {new Date(w.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    {w.rejectedReason ? ` · ${w.rejectedReason}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold">{statusLabel(w.status)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-secondary">No withdrawals yet.</p>
        )}
      </div>
    </Card>
  );
}
