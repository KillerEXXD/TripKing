import { Link } from 'react-router-dom';
import { ChevronLeft, Plus, ArrowDown } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

/** v7 Simple Mode — wallet. One big number, two big buttons. */
export function SimpleWalletPage() {
  const query = useCashWallet();
  const b = query.data?.balance;

  return (
    <div className="flex min-h-dvh flex-col bg-page pb-6">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div>
          <div className="text-[22px] font-bold">என் பணம்</div>
          <div className="text-[14px] text-muted-foreground">My money</div>
        </div>
      </header>

      <main className="space-y-4 px-5">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Could not load. Try again." onRetry={() => query.refetch()} />
        ) : (
          <>
            <article className="rounded-card border-4 border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] p-6 text-center">
              <div className="text-[16px] font-semibold">உங்கள் மொத்த பணம்</div>
              <div className="text-[14px] text-muted-foreground">Your total money</div>
              <div className="mt-3 text-[64px] font-extrabold leading-none text-[var(--skin-simple-go)]">
                {formatINR((b?.totalPaise ?? 0) / 100)}
              </div>
            </article>

            <article className="rounded-card border-2 border-border bg-surface p-4">
              <div className="text-[13px] text-muted-foreground">இதில் இருந்து · This is made of</div>
              <ul className="mt-2 space-y-2 text-[15px]">
                <li className="flex items-center justify-between"><span>நீங்கள் போட்டது · Cash you put in</span><span className="font-bold">{formatINR((b?.cashPaise ?? 0) / 100)}</span></li>
                <li className="flex items-center justify-between"><span>நண்பர் பணம் · Friend money</span><span className="font-bold">{formatINR((b?.transferredPaise ?? 0) / 100)}</span></li>
                <li className="flex items-center justify-between"><span>புரோமோ · Free credit</span><span className="font-bold">{formatINR((b?.promoPaise ?? 0) / 100)}</span></li>
              </ul>
            </article>

            <button
              type="button"
              className="flex h-16 w-full items-center justify-center gap-2 rounded-control bg-[var(--skin-simple-go)] text-[20px] font-bold text-white"
            >
              <Plus className="size-6" /> பணம் சேர் · Add money
            </button>
            <button
              type="button"
              className="flex h-16 w-full items-center justify-center gap-2 rounded-control border-2 border-primary text-[18px] font-bold text-primary"
            >
              <ArrowDown className="size-5" /> பணம் எடு · Take money out
            </button>

            <div className="rounded-card border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-3 text-center text-[14px]">
              <strong>பச்சை</strong> = சேர் &nbsp;·&nbsp; <strong>நீலம்</strong> = எடு<br />
              <span className="text-muted-foreground">Green = add · Blue = take out</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default SimpleWalletPage;
