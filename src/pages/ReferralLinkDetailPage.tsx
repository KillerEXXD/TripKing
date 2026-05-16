import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useReferralLink } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';

function rupees(paise: number): string {
  return formatINR(Math.round(Math.abs(paise) / 100));
}

/**
 * `/referrals/:linkId` — drilldown for one referred user. Their per-trip
 * contribution to your earnings (date, route, fee source, your accrual).
 */
export function ReferralLinkDetailPage() {
  const { linkId } = useParams();
  const q = useReferralLink(linkId);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/referrals" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Referrals
      </Link>

      {q.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load referral" message="Try again." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <h1 className="text-2xl font-bold">{q.data.link.referredUser?.displayName ?? 'Referred user'}</h1>
          <p className="text-xs text-secondary">{q.data.link.referredUserRole === 'trip_manager' ? 'Agent' : 'Driver'} · {q.data.link.referredUser?.phone ?? ''}</p>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Card className="gap-1 p-3">
              <div className="text-base font-bold tabular-nums">{q.data.link.eligiblePaidTripsCount}</div>
              <div className="text-secondary">Eligible trips</div>
            </Card>
            <Card className="gap-1 p-3">
              <div className="text-base font-bold tabular-nums">{rupees(q.data.link.totalEarnedPaise)}</div>
              <div className="text-secondary">Earned so far</div>
            </Card>
            <Card className="gap-1 p-3">
              <div className="text-base font-bold tabular-nums">{rupees(Math.max(0, q.data.link.capPaise - q.data.link.totalEarnedPaise))}</div>
              <div className="text-secondary">Cap remaining</div>
            </Card>
          </div>

          <Card className="gap-2">
            <div className="text-sm font-semibold">Per-trip contributions</div>
            {q.data.ledger.length === 0 ? (
              <p className="text-sm text-secondary">No accruals yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-secondary">
                      <th className="px-2 py-1.5">When</th>
                      <th className="px-2 py-1.5">Type</th>
                      <th className="px-2 py-1.5">Trip</th>
                      <th className="px-2 py-1.5">Source</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.ledger.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5 text-xs text-secondary">{new Date(e.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-2 py-1.5 text-xs uppercase">{e.entryType}</td>
                        <td className="px-2 py-1.5">
                          {e.trip?.id ? (
                            <Link to={`/trips/${e.trip.id}`} className="text-primary underline">
                              {e.trip.fromCityName ?? '—'} → {e.trip.toCityName ?? '—'}
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-xs">{e.fee?.paymentSource ? e.fee.paymentSource.replace(/_/g, ' ') : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          <span className={e.amountPaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {e.amountPaise >= 0 ? <ArrowDownRight className="mr-0.5 inline size-3.5" aria-hidden /> : <ArrowUpRight className="mr-0.5 inline size-3.5" aria-hidden />}
                            {e.amountPaise >= 0 ? '+' : '−'}{rupees(e.amountPaise)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </main>
  );
}

export default ReferralLinkDetailPage;
