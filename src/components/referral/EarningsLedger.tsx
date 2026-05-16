import { Card } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { ReferralLedgerEntry, ReferralLedgerEntryType } from '@/types';

const SOURCE_LABELS: Record<string, string> = {
  cash_wallet: 'Cash Wallet',
  direct_upi: 'Direct UPI',
  promo_credit: 'Promo credit',
  earnings_transfer_credit: 'Transferred earnings',
  admin_bonus: 'Admin bonus',
  coupon: 'Coupon',
};

const ELIGIBLE_SOURCES = new Set(['cash_wallet', 'direct_upi']);

const ENTRY_TONES: Record<ReferralLedgerEntryType, string> = {
  accrual: 'text-emerald-700',
  reversal: 'text-rose-700',
  transfer_out: 'text-sky-700',
  withdrawal: 'text-slate-700',
  adjustment: 'text-slate-700',
};

function rupees(paise: number): string {
  // Return just the formatted ₹ string (formatINR already prefixes ₹).
  const abs = Math.abs(paise);
  return formatINR(Math.round(abs / 100));
}

function entryLabel(t: ReferralLedgerEntryType): string {
  switch (t) {
    case 'accrual': return 'EARNED';
    case 'reversal': return 'REVERSED';
    case 'transfer_out': return 'TRANSFERRED';
    case 'withdrawal': return 'WITHDRAWN';
    case 'adjustment': return 'ADJUSTED';
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Earnings ledger — one row per ledger entry on `/referrals/me`.
 * The backend joins trip route, fee.payment_source, fee.side, and the
 * referred user's name into each row, so this component is pure render.
 */
export function EarningsLedger({ entries }: { entries: ReferralLedgerEntry[] }) {
  return (
    <Card aria-label="Earnings ledger" className="gap-0 p-0">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-secondary">
        Earnings ledger
      </div>
      {entries.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-secondary">No ledger activity yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-xs">
          {entries.map((e) => {
            const route = e.tripRoute && (e.tripRoute.from || e.tripRoute.to)
              ? `${e.tripRoute.from || '?'} → ${e.tripRoute.to || '?'}`
              : (e.note ?? entryLabel(e.entryType));
            const source = e.paymentSource ? (SOURCE_LABELS[e.paymentSource] ?? e.paymentSource) : null;
            const eligible = !e.paymentSource || ELIGIBLE_SOURCES.has(e.paymentSource);
            const isCredit = e.entryType === 'accrual';
            const sign = isCredit ? '+' : e.entryType === 'reversal' || e.entryType === 'transfer_out' || e.entryType === 'withdrawal' ? '−' : '';
            return (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{route}</div>
                  <div className="text-[10px] text-secondary">
                    {formatDate(e.createdAt)}
                    {e.referredUserName ? <> · {e.referredUserName}</> : null}
                    {source ? <> · {source}</> : null}
                    {e.feeSide ? <> · {e.feeSide}</> : null}
                    {!eligible ? (
                      <span className="ml-1 rounded bg-rose-50 px-1 py-0.5 text-rose-700">not eligible</span>
                    ) : null}
                    {e.entryType === 'reversal' && e.note ? (
                      <span className="ml-1 rounded bg-rose-50 px-1 py-0.5 text-rose-700">{e.note}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex-none text-right">
                  <div className={`font-bold ${ENTRY_TONES[e.entryType]}`}>
                    {sign}{rupees(e.amountPaise)}
                  </div>
                  <div className="text-[10px] uppercase text-secondary">{entryLabel(e.entryType)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default EarningsLedger;
