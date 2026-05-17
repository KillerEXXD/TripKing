import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';

export function EditorialWalletPage() {
  const query = useCashWallet();
  const b = query.data?.balance;

  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <Link to="/v5" aria-label="Back" className="m-3 -ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <ArrowLeft className="size-3" /> the journal
      </Link>
      <header className="border-b-2 border-foreground/80 pb-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">The accounts</div>
        <h1 className="editorial-headline mt-2 text-[32px] leading-tight">Your purse</h1>
      </header>

      {query.isLoading ? (
        <div className="pt-6"><LoadingSkeleton rows={3} /></div>
      ) : query.isError ? (
        <div className="pt-6"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <section className="mt-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">In total</div>
            <div className="editorial-headline mt-1 text-[52px] leading-none">
              {formatINR((b?.totalPaise ?? 0) / 100)}
            </div>
          </section>

          <section className="mt-8 border-t border-foreground/30 pt-6">
            <ul className="space-y-5">
              <Row label="In cash, top-ups" value={formatINR((b?.cashPaise ?? 0) / 100)} />
              <Row label="In friendship, transferred" value={formatINR((b?.transferredPaise ?? 0) / 100)} />
              <Row label="In credits, a welcome gift" value={formatINR((b?.promoPaise ?? 0) / 100)} muted />
            </ul>
          </section>

          <div className="mt-10 flex gap-4 text-[13px] uppercase tracking-wide">
            <button type="button" className="border-b border-foreground pb-0.5 hover:text-primary">Withdraw →</button>
            <button type="button" className="border-b border-foreground pb-0.5 hover:text-primary">Top up →</button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <li className={`flex items-baseline justify-between ${muted ? 'opacity-70' : ''}`}>
      <span className="text-[14px] italic text-muted-foreground">{label}</span>
      <span className="editorial-headline text-[22px]">{value}</span>
    </li>
  );
}

export default EditorialWalletPage;
