import { Link } from 'react-router-dom';
import { ChevronLeft, Plus, ArrowDown, RotateCw } from 'lucide-react';
import { useCashWallet } from '@/hooks/useCashWallet';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';

export function BharatWalletPage() {
  const query = useCashWallet();
  const b = query.data?.balance;

  return (
    <div className="mx-auto max-w-md pb-12">
      <header className="bg-primary px-4 pb-7 pt-4 text-primary-foreground">
        <Link to="/v6" aria-label="Back" className="mb-3 inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <BilingualText ta="மொத்த இருப்பு" en="Total balance" size="sm" className="opacity-80" />
        <div className="mt-1 text-[40px] font-bold leading-none">{formatINR((b?.totalPaise ?? 0) / 100)}</div>
      </header>

      {query.isLoading ? (
        <div className="p-4"><LoadingSkeleton rows={3} /></div>
      ) : query.isError ? (
        <div className="p-4"><ErrorState message="ஏற்ற முடியவில்லை · Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <section aria-label="Quick actions" className="mx-4 -mt-4 grid grid-cols-3 gap-3 rounded-card bg-surface p-3 shadow-card">
            <ActionTile icon={<Plus className="size-5" />} ta="நிரப்பு" en="Top up" />
            <ActionTile icon={<ArrowDown className="size-5" />} ta="பெறு" en="Withdraw" />
            <ActionTile icon={<RotateCw className="size-5" />} ta="பரிமாற்று" en="Transfer" />
          </section>

          <section className="m-4 space-y-3">
            <SubRow ta="பணம் (நீங்கள் நிரப்பியது)" en="Cash (your top-ups)" value={formatINR((b?.cashPaise ?? 0) / 100)} />
            <SubRow ta="பரிந்துரை சம்பாதிப்பு" en="Referral earnings" value={formatINR((b?.transferredPaise ?? 0) / 100)} />
            <SubRow ta="புரோமோ வரவு" en="Promo credit" value={formatINR((b?.promoPaise ?? 0) / 100)} muted />
          </section>
        </>
      )}
    </div>
  );
}

function ActionTile({ icon, ta, en }: { icon: React.ReactNode; ta: string; en: string }) {
  return (
    <button type="button" className="flex flex-col items-center gap-1.5 rounded-card p-2">
      <div className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">{icon}</div>
      <BilingualText ta={ta} en={en} size="sm" />
    </button>
  );
}

function SubRow({ ta, en, value, muted }: { ta: string; en: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-card bg-surface p-4 shadow-card ${muted ? 'opacity-70' : ''}`}>
      <BilingualText ta={ta} en={en} size="sm" />
      <div className="text-[18px] font-bold" style={{ color: muted ? 'inherit' : 'var(--skin-bharat-vermilion)' }}>
        {value}
      </div>
    </div>
  );
}

export default BharatWalletPage;
