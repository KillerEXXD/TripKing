import { useState } from 'react';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { useReferralDashboard, useTransferReferralToCashWallet } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';

const PRESET_RUPEES = [100, 250, 500, 1000];

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

/**
 * Stage 6 — moves released referral earnings into the cash (trip) wallet.
 * Verbatim warning from spec §22 / §407: transferred earnings can pay platform
 * fees but can't be withdrawn and don't generate further referral rewards.
 */
export function TransferToWalletPanel() {
  const dash = useReferralDashboard();
  const transfer = useTransferReferralToCashWallet();

  const withdrawable = dash.data?.summary.withdrawablePaise ?? 0;
  const minRupees = 1;
  const maxRupees = Math.floor(withdrawable / 100);

  const [rupeesInput, setRupeesInput] = useState<number>(0);
  const isValid = rupeesInput >= minRupees && rupeesInput <= maxRupees;

  async function onConfirm() {
    if (!isValid) return;
    try {
      const result = await transfer.mutateAsync(rupeesInput * 100);
      toast.success(`Transferred ${formatINR(rupeesInput)} to your trip wallet`);
      setRupeesInput(0);
      // Result also surfaces fresh balances via invalidations.
      void result;
    } catch {
      // global mutation funnel toasts
    }
  }

  return (
    <Card aria-label="Transfer to trip wallet">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <ArrowRightLeft className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Transfer to trip wallet</div>
          <div className="text-xs text-secondary">
            Withdrawable balance: <span className="font-semibold text-foreground">{rupees(withdrawable)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Transferred earnings can be used to pay platform fees but cannot be withdrawn later and will not generate further referral rewards.</p>
        </div>
      </div>

      <label className="block text-sm font-medium">
        Amount (₹)
        <input
          type="number"
          inputMode="numeric"
          min={minRupees}
          max={maxRupees}
          value={rupeesInput || ''}
          onChange={(e) => setRupeesInput(Number(e.target.value) || 0)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          aria-describedby="transfer-amount-hint"
        />
        <span id="transfer-amount-hint" className="mt-1 block text-xs text-secondary">
          Up to {rupees(withdrawable)}
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        {PRESET_RUPEES.filter((p) => p <= maxRupees).map((p) => (
          <Button key={p} type="button" variant={rupeesInput === p ? 'default' : 'outline'} size="sm" onClick={() => setRupeesInput(p)}>
            {formatINR(p)}
          </Button>
        ))}
        {maxRupees > 0 ? (
          <Button type="button" variant={rupeesInput === maxRupees ? 'default' : 'outline'} size="sm" onClick={() => setRupeesInput(maxRupees)}>
            All
          </Button>
        ) : null}
      </div>

      <Button type="button" variant="full" onClick={() => void onConfirm()} disabled={!isValid || transfer.isPending}>
        {transfer.isPending ? 'Transferring…' : `Transfer ${rupees(rupeesInput * 100)}`}
      </Button>
    </Card>
  );
}
