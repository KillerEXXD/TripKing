import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import {
  useAdminReferrals,
  usePatchAdminReferralStatus,
  useReverseAdminReferralEarnings,
} from '@/hooks/useAdminReferrals';
import { formatINR } from '@/lib/utils';
import type { ReferralLink, ReferralLinkStatus } from '@/types';

const STATUS_FILTERS: (ReferralLinkStatus | 'all')[] = ['all', 'signed_up', 'verified', 'qualified', 'earning_active', 'cap_reached', 'suspended', 'rejected', 'expired'];
const STATUS_TRANSITIONS: ReferralLinkStatus[] = ['suspended', 'rejected', 'earning_active'];

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function Row({ link, busy, onSetStatus, onReverse }: {
  link: ReferralLink;
  busy: boolean;
  onSetStatus: (status: ReferralLinkStatus) => void;
  onReverse: () => void;
}) {
  const [setStatus, setSetStatus] = useState<ReferralLinkStatus>('suspended');
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-2 py-2">
        <Link to={`/app/referrals/${link.id}`} className="text-sm font-medium text-primary hover:underline">
          {link.referredUser?.displayName ?? '—'}
        </Link>
        <div className="text-[11px] text-secondary">{link.referredUserRole === 'trip_manager' ? 'Agent' : 'Driver'}</div>
      </td>
      <td className="px-2 py-2 text-xs uppercase">{link.status.replace(/_/g, ' ')}</td>
      <td className="px-2 py-2 text-right tabular-nums">{link.eligiblePaidTripsCount}</td>
      <td className="px-2 py-2 text-right tabular-nums">{rupees(link.totalEarnedPaise)}</td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1.5">
          <select
            value={setStatus}
            onChange={(e) => setSetStatus(e.target.value as ReferralLinkStatus)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            aria-label="Choose status"
          >
            {STATUS_TRANSITIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSetStatus(setStatus)}>
            Set
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReverse}>
            <RotateCcw className="mr-1 size-3.5" aria-hidden /> Reverse
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** `/app/administration/referrals` — Stage 9 admin link queue with suspend / reverse actions. */
export function AdminReferralsPage() {
  const [filter, setFilter] = useState<ReferralLinkStatus | 'all'>('all');
  const params = filter === 'all' ? undefined : { status: filter };
  const q = useAdminReferrals(params);
  const setStatus = usePatchAdminReferralStatus();
  const reverse = useReverseAdminReferralEarnings();
  const busy = setStatus.isPending || reverse.isPending;

  async function onSetStatus(id: string, status: ReferralLinkStatus) {
    try {
      await setStatus.mutateAsync({ id, status });
      toast.success(`Status set to ${status}`);
    } catch {}
  }
  async function onReverse(id: string) {
    if (!confirm('Reverse all released earnings on this referral? This cannot be undone.')) return;
    try {
      const result = await reverse.mutateAsync({ id });
      toast.success(`Reversed ${rupees(result.reversedPaise)}`);
    } catch {}
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <Link to="/app/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Referrals</h1>
        <Link to="/app/administration/referrals/flags" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ShieldAlert className="size-4" aria-hidden /> Fraud queue →
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Referral status filter">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-current={filter === s ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-xs uppercase ${filter === s ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'}`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </nav>

      {q.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load referrals" message="Try again." onRetry={() => void q.refetch()} />
      ) : (
        <Card className="gap-2">
          {q.data.length === 0 ? (
            <p className="text-sm text-secondary">No referrals match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-secondary">
                    <th className="px-2 py-1.5">User</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5 text-right">Trips</th>
                    <th className="px-2 py-1.5 text-right">Earned</th>
                    <th className="px-2 py-1.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((l) => (
                    <Row
                      key={l.id}
                      link={l}
                      busy={busy}
                      onSetStatus={(status) => void onSetStatus(l.id, status)}
                      onReverse={() => void onReverse(l.id)}
                    />
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

export default AdminReferralsPage;
