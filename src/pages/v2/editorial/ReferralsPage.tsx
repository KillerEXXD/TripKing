import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useReferralDashboard } from '@/hooks/useReferral';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

export function EditorialReferralsPage() {
  const query = useReferralDashboard();
  const s = query.data?.summary;
  const ledger = query.data?.recentLedger ?? [];

  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <Link to="/v5" aria-label="Back" className="m-3 -ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <ArrowLeft className="size-3" /> the journal
      </Link>
      <header className="border-b-2 border-foreground/80 pb-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">The patron's column</div>
        <h1 className="editorial-headline mt-2 text-[32px] leading-tight">Your friends, your earnings</h1>
      </header>

      {query.isLoading ? (
        <div className="pt-6"><LoadingSkeleton rows={4} /></div>
      ) : query.isError ? (
        <div className="pt-6"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-y-6">
            <Stat label="Lifetime" value={formatINR((s?.lifetimeEarnedPaise ?? 0) / 100)} />
            <Stat label="Withdrawable" value={formatINR((s?.withdrawablePaise ?? 0) / 100)} />
            <Stat label="Referred" value={String(s?.counts.totalReferred ?? 0)} />
            <Stat label="Qualified" value={String(s?.counts.qualified ?? 0)} />
          </dl>

          <p className="mt-8 text-[14px] italic leading-relaxed text-muted-foreground">
            Your code <span className="editorial-headline not-italic text-foreground">RAVEE-X91Z</span> is the line
            you share with friends; their first verified trip is the moment a small reward enters your column.
          </p>

          {ledger.length > 0 ? (
            <section className="mt-8 border-t border-foreground/30 pt-6">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">From the ledger</div>
              <ul className="mt-2 divide-y divide-border">
                {ledger.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between py-3">
                    <span className="editorial-headline text-[16px]">{e.entryType.replace(/_/g, ' ')}</span>
                    <span className={`text-[14px] ${e.amountPaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {e.amountPaise >= 0 ? '+' : ''}{formatINR(e.amountPaise / 100)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="editorial-headline mt-0.5 text-[26px] leading-none">{value}</dd>
    </>
  );
}

export default EditorialReferralsPage;
