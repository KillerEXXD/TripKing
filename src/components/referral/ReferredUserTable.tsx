import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useReferred } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';
import type { ReferralLink, ReferralLinkStatus } from '@/types';

type Filter = 'all' | 'driver' | 'agent' | 'verified' | 'qualified' | 'cap_reached' | 'pending';

const STATUS_TINT: Record<ReferralLinkStatus, string> = {
  signed_up: 'bg-slate-100 text-slate-700',
  verification_pending: 'bg-amber-100 text-amber-800',
  verified: 'bg-sky-100 text-sky-800',
  verification_rejected: 'bg-rose-100 text-rose-800',
  paid_trips_started: 'bg-emerald-100 text-emerald-800',
  qualified: 'bg-emerald-100 text-emerald-800',
  earning_active: 'bg-emerald-200 text-emerald-900',
  cap_reached: 'bg-violet-100 text-violet-800',
  suspended: 'bg-rose-100 text-rose-800',
  rejected: 'bg-rose-100 text-rose-800',
  expired: 'bg-slate-200 text-slate-700',
};

function rupees(paise: number): string {
  return formatINR(Math.round(paise / 100));
}

function maskPhone(phone?: string): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `••• ••• ${digits.slice(-4)}`;
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return iso.slice(0, 10);
  }
}

function Row({ link }: { link: ReferralLink }) {
  const earned = link.totalEarnedPaise;
  const cap = link.capPaise;
  const pct = cap > 0 ? Math.min(100, Math.round((earned / cap) * 100)) : 0;
  const role = link.referredUserRole === 'trip_manager' ? 'agent' : 'driver';
  return (
    <li>
      <Link to={`/app/referrals/${link.id}`} className="block px-3 py-2.5 transition hover:bg-slate-50">
        <div className="flex items-start gap-2">
          <div className="flex size-8 flex-none items-center justify-center rounded-full bg-slate-100 text-base" aria-hidden>
            {role === 'driver' ? '🚗' : '📋'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                {link.referredUser?.displayName ?? '—'}
              </span>
              <span
                className={`flex-none rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_TINT[link.status]}`}
              >
                {link.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="mt-0.5 grid grid-cols-2 gap-1 text-[10px] text-slate-500 sm:grid-cols-4">
              <span>📞 {maskPhone(link.referredUser?.phone)}</span>
              <span>📅 {formatDate(link.createdAt) ?? '—'}</span>
              <span>🏁 {link.eligiblePaidTripsCount} eligible trips</span>
              <span>{formatDate(link.lastTripAt) ? `🛣 last ${formatDate(link.lastTripAt)}` : '—'}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex-none text-right">
            <div className="text-sm font-bold text-emerald-700">{rupees(earned)}</div>
            <div className="text-[10px] text-slate-500">/ {rupees(cap)}</div>
          </div>
          <ArrowRight size={14} aria-hidden className="mt-1 flex-none text-slate-400" />
        </div>
      </Link>
    </li>
  );
}

/**
 * Referred-users list. Filter pills (All / Drivers / Agents / Verified /
 * Qualified+ / Cap reached / Pending verification) all filter the
 * already-fetched list client-side — except role, which goes to the
 * server (the only filter the backend route accepts beyond `status`).
 */
export function ReferredUserTable() {
  const [filter, setFilter] = useState<Filter>('all');

  const params: Parameters<typeof useReferred>[0] = {};
  if (filter === 'driver') params.role = 'driver';
  if (filter === 'agent') params.role = 'trip_manager';
  const q = useReferred(Object.keys(params).length ? params : undefined);

  const visible = useMemo(() => {
    const data = q.data ?? [];
    return data.filter((l) => {
      switch (filter) {
        case 'all':
        case 'driver':
        case 'agent':
          return true;
        case 'verified':
          // "Verified" = status has progressed past pending verification.
          return ['verified', 'paid_trips_started', 'qualified', 'earning_active', 'cap_reached'].includes(l.status);
        case 'qualified':
          return ['qualified', 'earning_active', 'cap_reached'].includes(l.status);
        case 'cap_reached':
          return l.status === 'cap_reached';
        case 'pending':
          return l.status === 'verification_pending' || l.status === 'signed_up';
      }
    });
  }, [q.data, filter]);

  const total = q.data?.length ?? 0;

  return (
    <Card aria-label="Referred users" className="gap-0 p-0">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-secondary">Referred users</div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          aria-label="Filter referred users"
        >
          <option value="all">All ({total})</option>
          <option value="driver">Drivers</option>
          <option value="agent">Agents</option>
          <option value="verified">Verified</option>
          <option value="qualified">Qualified +</option>
          <option value="cap_reached">Cap reached</option>
          <option value="pending">Pending verification</option>
        </select>
      </div>

      {q.isPending ? (
        <div className="p-3"><LoadingSkeleton rows={3} /></div>
      ) : q.isError ? (
        <div className="p-3">
          <ErrorState title="Couldn't load referrals" message="Try again." onRetry={() => void q.refetch()} />
        </div>
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-secondary">No referrals match this filter.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((l) => <Row key={l.id} link={l} />)}
        </ul>
      )}
    </Card>
  );
}

export default ReferredUserTable;
