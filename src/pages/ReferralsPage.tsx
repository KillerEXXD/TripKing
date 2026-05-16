import { PageHeader, PageShell } from '@/components/layout';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useAuth } from '@/contexts/AuthContext';
import { useReferralDashboard } from '@/hooks/useReferral';
import { ReferralCodeBlock } from '@/components/referral/ReferralCodeBlock';
import { EarningsStatsRow } from '@/components/referral/EarningsStatsRow';
import { EarningsTimelineChart } from '@/components/referral/EarningsTimelineChart';
import { TierProgressCard } from '@/components/referral/TierProgressCard';
import { ReferredUserTable } from '@/components/referral/ReferredUserTable';
import { EarningsLedger } from '@/components/referral/EarningsLedger';
import { TransferToWalletPanel } from '@/components/referral/TransferToWalletPanel';
import { WithdrawalCard } from '@/components/referral/WithdrawalCard';
import { ReferralTermsAndFAQ } from '@/components/referral/ReferralTermsAndFAQ';
import type { ReferralRole } from '@/hooks/useReferral';

function roleFor(userRole: string | undefined): ReferralRole {
  // Admins viewing their own /referrals page act as drivers by default — the
  // referral program is for drivers + trip-managers; admins still get a code.
  return userRole === 'trip_manager' ? 'agent' : 'driver';
}

/**
 * `/referrals` — driver / agent referral dashboard. Sections match the
 * tour prototype 1:1, top-to-bottom:
 *   1. PageHeader
 *   2. ReferralCodeBlock  — hero code + share + invite CTAs
 *   3. EarningsStatsRow   — 7 figures
 *   4. EarningsTimelineChart — daily bar chart (7 / 30 / 90)
 *   5. TierProgressCard   — current tier + ladder
 *   6. ReferredUserTable  — filterable list with progress bars
 *   7. EarningsLedger     — recent 30 ledger rows
 *   8. TransferToWalletPanel + WithdrawalCard (side-by-side on md+)
 *   9. ReferralTermsAndFAQ
 */
export function ReferralsPage() {
  const { user } = useAuth();
  const role = roleFor(user?.role);
  const q = useReferralDashboard();

  return (
    <PageShell>
      <PageHeader
        title="Refer & earn"
        subtitle="Invite drivers and agents — earn from every eligible paid trip they run."
        backTo="/"
      />

      {q.isPending ? (
        <LoadingSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load referrals" message="Try again." onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-3">
          <ReferralCodeBlock role={role} name={user?.displayName} />
          <EarningsStatsRow />
          <EarningsTimelineChart />
          <TierProgressCard />
          <ReferredUserTable />
          <EarningsLedger entries={q.data.recentLedger} />
          <div className="grid gap-3 md:grid-cols-2">
            <TransferToWalletPanel />
            <WithdrawalCard />
          </div>
          <ReferralTermsAndFAQ />
        </div>
      )}
    </PageShell>
  );
}

export default ReferralsPage;
