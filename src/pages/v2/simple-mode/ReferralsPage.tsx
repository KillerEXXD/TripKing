import { Link } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Phone, Users } from 'lucide-react';
import { useReferralDashboard } from '@/hooks/useReferral';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

/** v7 Simple Mode — referrals. Big yellow number + 2 share buttons. */
export function SimpleReferralsPage() {
  const query = useReferralDashboard();
  const s = query.data?.summary;
  const code = 'RAVEE-X91Z';

  return (
    <div className="flex min-h-dvh flex-col bg-page pb-6">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div>
          <div className="text-[22px] font-bold">நண்பர் பணம்</div>
          <div className="text-[14px] text-muted-foreground">Get money for friends</div>
        </div>
      </header>

      <main className="space-y-4 px-5">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Could not load. Try again." onRetry={() => query.refetch()} />
        ) : (
          <>
            <article className="rounded-card border-4 border-warning bg-[var(--skin-simple-wait-bg)] p-6 text-center">
              <div className="text-[16px] font-semibold">இதுவரை சம்பாதித்தது</div>
              <div className="text-[14px] text-muted-foreground">You earned so far</div>
              <div className="mt-3 text-[56px] font-extrabold leading-none">
                {formatINR((s?.lifetimeEarnedPaise ?? 0) / 100)}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2 text-[14px] text-muted-foreground">
                <Users className="size-4" /> {s?.counts.totalReferred ?? 0} {(s?.counts.totalReferred ?? 0) === 1 ? 'friend' : 'friends'}
              </div>
            </article>

            <article className="rounded-card border-2 border-border bg-surface p-5 text-center">
              <div className="text-[14px] text-muted-foreground">உங்கள் குறியீடு · Your code</div>
              <div className="mt-2 text-[34px] font-extrabold tracking-[0.18em]">{code}</div>
              <div className="mt-2 text-[13px] text-muted-foreground">Tell this code to your friend</div>
            </article>

            <button
              type="button"
              className="flex h-16 w-full items-center justify-center gap-3 rounded-control bg-[var(--skin-simple-go)] text-[18px] font-bold text-white"
            >
              <MessageCircle className="size-6" /> வாட்ஸ்அப் · Send on WhatsApp
            </button>
            <button
              type="button"
              className="flex h-14 w-full items-center justify-center gap-3 rounded-control border-2 border-primary text-[16px] font-bold text-primary"
            >
              <Phone className="size-5" /> நண்பரை அழை · Call a friend
            </button>
          </>
        )}
      </main>
    </div>
  );
}

export default SimpleReferralsPage;
