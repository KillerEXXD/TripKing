import { Link } from 'react-router-dom';
import { ArrowLeft, Award, IndianRupee, Users } from 'lucide-react';
import { Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useReferralDashboard } from '@/hooks/useReferral';
import { TransferToWalletPanel } from '@/components/referral/TransferToWalletPanel';
import { formatINR } from '@/lib/utils';

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="gap-1">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-secondary">{sub}</div> : null}
    </Card>
  );
}

/**
 * `/referrals` — Stage 6 minimum: lifetime stats + Transfer-to-wallet panel.
 * Stage 8 will add the per-link list, earnings chart, and link drilldown.
 */
export function ReferralsPage() {
  const q = useReferralDashboard();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Your referrals</h1>

      {q.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load referrals" message="Try again." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat icon={<Users className="size-3.5" />} label="Referred" value={String(q.data.summary.counts.totalReferred)} sub={`${q.data.summary.counts.qualified} qualified`} />
            <Stat icon={<Award className="size-3.5" />} label="Lifetime earned" value={rupees(q.data.summary.lifetimeEarnedPaise)} />
            <Stat icon={<IndianRupee className="size-3.5" />} label="Withdrawable" value={rupees(q.data.summary.withdrawablePaise)} sub="Released earnings" />
          </div>

          <TransferToWalletPanel />
        </>
      )}
    </main>
  );
}

export default ReferralsPage;
