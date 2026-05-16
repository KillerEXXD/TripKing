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
import { cn, formatINR } from '@/lib/utils';

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

// Same accent vocabulary as HomeTileRow — keeps the redesign tile pattern
// consistent across the app: each accent pair (--color-<x>-accent +
// --color-<x>-accent-light) drives the left border, label colour, and bg
// tint in one step. Green = Referred, blue = Lifetime, purple = Withdrawable.
const ACCENT = {
  green:  { border: 'border-l-green-accent',  label: 'text-green-accent',  bg: 'bg-green-accent-light'  },
  blue:   { border: 'border-l-blue-accent',   label: 'text-blue-accent',   bg: 'bg-blue-accent-light'   },
  purple: { border: 'border-l-purple-accent', label: 'text-purple-accent', bg: 'bg-purple-accent-light' },
} as const;

function Stat({ accent, icon, label, value, sub }: { accent: keyof typeof ACCENT; icon: React.ReactNode; label: string; value: string; sub?: string }) {
  const tone = ACCENT[accent];
  return (
    <Card className={cn('gap-1 border-l-4', tone.border, tone.bg)}>
      <SectionLabel className={cn('flex items-center gap-1.5', tone.label)}>
        {icon} {label}
      </SectionLabel>
      <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
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
            <Stat accent="green"  icon={<Users className="size-3.5" />}        label="Referred"        value={String(q.data.summary.counts.totalReferred)} sub={`${q.data.summary.counts.qualified} qualified`} />
            <Stat accent="blue"   icon={<Award className="size-3.5" />}        label="Lifetime earned" value={rupees(q.data.summary.lifetimeEarnedPaise)} />
            <Stat accent="purple" icon={<IndianRupee className="size-3.5" />}  label="Withdrawable"    value={rupees(q.data.summary.withdrawablePaise)} sub="Released earnings" />
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
