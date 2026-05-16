import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useReferred } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';
import type { ReferralLink, ReferralLinkStatus } from '@/types';

type StatusFilter = ReferralLinkStatus | 'all';
type RoleFilter = 'all' | 'driver' | 'trip_manager';

const STATUS_FILTERS: StatusFilter[] = ['all', 'signed_up', 'verified', 'paid_trips_started', 'qualified', 'earning_active', 'cap_reached', 'rejected', 'expired'];
const ROLE_FILTERS: RoleFilter[] = ['all', 'driver', 'trip_manager'];

const STATUS_TINT: Record<ReferralLinkStatus, string> = {
  signed_up: 'bg-muted/50 text-secondary ring-input',
  verification_pending: 'bg-amber-50 text-amber-900 ring-amber-200',
  verified: 'bg-sky-50 text-sky-900 ring-sky-200',
  verification_rejected: 'bg-rose-50 text-rose-900 ring-rose-200',
  paid_trips_started: 'bg-sky-50 text-sky-900 ring-sky-200',
  qualified: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  earning_active: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  cap_reached: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  suspended: 'bg-rose-50 text-rose-900 ring-rose-200',
  rejected: 'bg-rose-50 text-rose-900 ring-rose-200',
  expired: 'bg-muted/50 text-secondary ring-input',
};

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function Row({ link }: { link: ReferralLink }) {
  const remaining = Math.max(0, link.capPaise - link.totalEarnedPaise);
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-2 py-2">
        <Link to={`/referrals/${link.id}`} className="text-sm font-medium text-primary hover:underline">
          {link.referredUser?.displayName ?? '—'}
        </Link>
        <div className="text-[11px] text-secondary">{link.referredUser?.phone ?? ''} · {link.referredUserRole === 'trip_manager' ? 'Agent' : 'Driver'}</div>
      </td>
      <td className="px-2 py-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_TINT[link.status]}`}>{link.status.replace(/_/g, ' ')}</span>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{link.eligiblePaidTripsCount}</td>
      <td className="px-2 py-2 text-right tabular-nums">{rupees(link.totalEarnedPaise)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-secondary">{rupees(remaining)}</td>
    </tr>
  );
}

/** Stage 8 — referred users table with status / role filters. Click name → drilldown. */
export function ReferredUserTable() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [role, setRole] = useState<RoleFilter>('all');
  const params: Parameters<typeof useReferred>[0] = {};
  if (status !== 'all') params.status = status;
  if (role !== 'all') params.role = role;
  const q = useReferred(Object.keys(params).length ? params : undefined);

  return (
    <Card aria-label="Referred users" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">Referred users</div>
        <div className="flex flex-wrap gap-1">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-current={role === r ? 'true' : undefined}
              className={`rounded-full px-2.5 py-0.5 text-[11px] ${role === r ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'}`}
            >
              {r === 'trip_manager' ? 'agent' : r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            aria-current={status === s ? 'true' : undefined}
            className={`rounded-full px-2.5 py-0.5 text-[11px] ${status === s ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'}`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <LoadingSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load referrals" message="Try again." onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="text-sm text-secondary">No referred users match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-secondary">
                <th className="px-2 py-1.5">User</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5 text-right">Trips</th>
                <th className="px-2 py-1.5 text-right">Earned</th>
                <th className="px-2 py-1.5 text-right">Cap left</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((l) => <Row key={l.id} link={l} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
