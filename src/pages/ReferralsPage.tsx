import { Award, IndianRupee, Users } from 'lucide-react';
import { PageHeader, PageShell } from '@/components/layout';
import { Card, SectionLabel } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useReferralDashboard } from '@/hooks/useReferral';
import { TransferToWalletPanel } from '@/components/referral/TransferToWalletPanel';
import { WithdrawalCard } from '@/components/referral/WithdrawalCard';
import { EarningsTimelineChart } from '@/components/referral/EarningsTimelineChart';
import { ReferredUserTable } from '@/components/referral/ReferredUserTable';
import { ReferralTermsAndFAQ } from '@/components/referral/ReferralTermsAndFAQ';
import { formatINR } from '@/lib/utils';

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="gap-1">
      <SectionLabel className="flex items-center gap-1.5">
        {icon} {label}
      </SectionLabel>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-micro text-muted-foreground">{sub}</div> : null}
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
    <PageShell>
      <PageHeader title="Refer & earn" subtitle="₹50 per qualifying trip from each verified driver or agent you bring on" backTo="/" />
      <p className="mb-3 text-sm text-muted-foreground">
        Invite trusted drivers and agents to TripKing. Once they become verified, finish their launch credits, and start completing eligible paid trips, you earn ₹50 per trip until your referral cap is reached.
      </p>

      {q.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load referrals" message="Try again." onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat icon={<Users className="size-3.5" />} label="Referred" value={String(q.data.summary.counts.totalReferred)} sub={`${q.data.summary.counts.qualified} qualified`} />
            <Stat icon={<Award className="size-3.5" />} label="Lifetime earned" value={rupees(q.data.summary.lifetimeEarnedPaise)} />
            <Stat icon={<IndianRupee className="size-3.5" />} label="Withdrawable" value={rupees(q.data.summary.withdrawablePaise)} sub="Released earnings" />
          </div>

          <EarningsTimelineChart />
          <ReferredUserTable />
          <TransferToWalletPanel />
          <WithdrawalCard />
          <ReferralTermsAndFAQ />
        </div>
      )}
    </PageShell>
  );
}

export default ReferralsPage;
