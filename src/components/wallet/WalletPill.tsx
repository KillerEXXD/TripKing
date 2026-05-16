import { Link } from 'react-router-dom';
import { AlertTriangle, Wallet } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { formatINR } from '@/lib/utils';

interface Props {
  /** When set, renders a low-balance warning when total < threshold paise. */
  lowBalanceThresholdPaise?: number;
}

/**
 * Stage 3 — compact wallet-balance pill for driver/agent home headers.
 * Hidden until the API responds; shows total balance + a low-balance warning chip.
 * Links to `/wallet` for top-up.
 */
export function WalletPill({ lowBalanceThresholdPaise }: Props) {
  const q = useCashWallet();
  if (q.isPending || q.isError || !q.data) return null;

  const total = q.data.balance.totalPaise;
  const isLow = typeof lowBalanceThresholdPaise === 'number' && total < lowBalanceThresholdPaise;

  return (
    <Link
      to="/wallet"
      aria-label="Open wallet"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors ${
        isLow
          ? 'bg-amber-50 text-amber-900 ring-amber-300 hover:bg-amber-100'
          : 'bg-emerald-50 text-emerald-900 ring-emerald-200 hover:bg-emerald-100'
      }`}
    >
      {isLow ? <AlertTriangle className="size-3.5" aria-hidden /> : <Wallet className="size-3.5" aria-hidden />}
      <span className="tabular-nums">{formatINR(Math.round(total / 100))}</span>
    </Link>
  );
}
