import { lazy, Suspense } from 'react';
import { PageHeader, PageShell } from '@/components/layout';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useAuth } from '@/contexts/AuthContext';
import { useReferralDashboard } from '@/hooks/useReferral';
import { useAppBack } from '@/hooks/useAppBack';
import { ReferralCodeBlock } from '@/components/referral/ReferralCodeBlock';
import { EarningsStatsRow } from '@/components/referral/EarningsStatsRow';
import { TierProgressCard } from '@/components/referral/TierProgressCard';
import { ReferredUserTable } from '@/components/referral/ReferredUserTable';
import { EarningsLedger } from '@/components/referral/EarningsLedger';
import { TransferToWalletPanel } from '@/components/referral/TransferToWalletPanel';
import { WithdrawalCard } from '@/components/referral/WithdrawalCard';
import { ReferralTermsAndFAQ } from '@/components/referral/ReferralTermsAndFAQ';
import type { ReferralRole } from '@/hooks/useReferral';

// recharts is heavy (~120kb in vendor-charts) and the chart is below the fold for the
// LCP element (ReferralCodeBlock hero). Lazy-load so it doesn't block first paint.
const EarningsTimelineChart = lazy(() =>
  import('@/components/referral/EarningsTimelineChart').then((m) => ({ default: m.EarningsTimelineChart })),
);

function roleFor(userRole: string | undefined): ReferralRole {
  // Admins viewing their own /referrals page act as drivers by default — the
  // referral program is for drivers + trip-managers; admins still get a code.
  return userRole === 'trip_manager' ? 'agent' : 'driver';
}

/**
 * `/app/referrals` — driver / agent referral dashboard. Sections match the
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
  const back = useAppBack();
  const { user } = useAuth();
  const role = roleFor(user?.role);
  const q = useReferralDashboard();

  return (
    <PageShell>
      <PageHeader
        title="Refer & earn"
        subtitle="Invite drivers and agents — earn from every eligible paid trip they run."
        onBack={back}
      />

      {/* Render the hero FIRST, regardless of the dashboard query state — it has its own
          isLoading state via useReferral(role) and is the LCP element. Pre-fix, this was
          gated behind useReferralDashboard's ~1.5s aggregation. */}
      <div className="space-y-3">
        <ReferralCodeBlock role={role} name={user?.displayName} />
        {q.isPending ? (
          <LoadingSkeleton rows={5} />
        ) : q.isError ? (
          <ErrorState title="Couldn't load referrals" message="Try again." onRetry={() => void q.refetch()} />
        ) : (
          <>
            <EarningsStatsRow />
            <Suspense fallback={<LoadingSkeleton className="h-44" />}>
              <EarningsTimelineChart />
            </Suspense>
            <TierProgressCard />
            <ReferredUserTable />
            <EarningsLedger entries={q.data.recentLedger} />
            <div className="grid gap-3 md:grid-cols-2">
              <TransferToWalletPanel />
              <WithdrawalCard />
            </div>
            <ReferralTermsAndFAQ />
          </>
        )}
      </div>
    </PageShell>
  );
}

export default ReferralsPage;
