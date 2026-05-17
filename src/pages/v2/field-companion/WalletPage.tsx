import { Link } from 'react-router-dom';
import { ChevronLeft, Plus } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import { StickyCtaBar } from '@/components/v2/field-companion/StickyCtaBar';

export function FieldWalletPage() {
  const query = useCashWallet();
  const b = query.data?.balance;

  return (
    <div className="min-h-dvh pb-32">
      <header className="flex items-center gap-3 px-5 pt-4">
        <Link to="/v3" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[22px] font-bold">Wallet</h1>
      </header>

      {query.isLoading ? (
        <div className="px-5 pt-6"><LoadingSkeleton rows={3} /></div>
      ) : query.isError ? (
        <div className="px-5 pt-6"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <section className="mx-5 mt-6 rounded-card bg-surface p-6 text-center shadow-card">
            <div className="text-[14px] uppercase tracking-wide text-muted-foreground">Total balance</div>
            <div className="mt-2 text-[56px] font-bold leading-none">
              {formatINR((b?.totalPaise ?? 0) / 100)}
            </div>
          </section>

          <section className="mx-5 mt-3 space-y-2">
            <Strip label="Cash" hint="From top-ups · withdrawable" value={formatINR((b?.cashPaise ?? 0) / 100)} />
            <Strip label="Referrals" hint="Earned from friends · withdrawable" value={formatINR((b?.transferredPaise ?? 0) / 100)} />
            <Strip label="Promo" hint="Launch credit · not withdrawable" value={formatINR((b?.promoPaise ?? 0) / 100)} muted />
          </section>
        </>
      )}

      <StickyCtaBar>
        <button
          type="button"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-[17px] font-semibold text-primary-foreground shadow-fab"
        >
          <Plus className="size-5" /> Top up
        </button>
      </StickyCtaBar>
    </div>
  );
}

function Strip({ label, hint, value, muted }: { label: string; hint: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-card bg-surface p-4 shadow-card ${muted ? 'opacity-70' : ''}`}>
      <div>
        <div className="text-[15px] font-semibold">{label}</div>
        <div className="text-[12px] text-muted-foreground">{hint}</div>
      </div>
      <div className="text-[18px] font-bold">{value}</div>
    </div>
  );
}

export default FieldWalletPage;
