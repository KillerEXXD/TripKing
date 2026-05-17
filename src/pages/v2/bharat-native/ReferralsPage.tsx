import { Link } from 'react-router-dom';
import { ChevronLeft, Share2, MessageCircle, Phone } from 'lucide-react';
import { useReferralDashboard } from '@/hooks/useReferral';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';

export function BharatReferralsPage() {
  const query = useReferralDashboard();
  const s = query.data?.summary;

  return (
    <div className="mx-auto max-w-md pb-12">
      <header className="bg-primary px-4 pb-6 pt-4 text-primary-foreground">
        <Link to="/v6" aria-label="Back" className="mb-3 inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <BilingualText as="h1" ta="நண்பர்களை அழைக்க" en="Refer a friend" size="lg" />
      </header>

      {query.isLoading ? (
        <div className="p-4"><LoadingSkeleton rows={3} /></div>
      ) : query.isError ? (
        <div className="p-4"><ErrorState message="ஏற்ற முடியவில்லை · Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : (
        <>
          <section className="mx-4 -mt-4 rounded-card bg-surface p-5 shadow-card">
            <BilingualText ta="மொத்த சம்பாதிப்பு" en="Lifetime earnings" size="sm" />
            <div
              className="mt-1 text-[36px] font-bold leading-none"
              style={{ color: 'var(--skin-bharat-vermilion)' }}
            >
              {formatINR((s?.lifetimeEarnedPaise ?? 0) / 100)}
            </div>
            <BilingualText
              ta={`${s?.counts.totalReferred ?? 0} நண்பர்கள்`}
              en={`${s?.counts.totalReferred ?? 0} ${s?.counts.totalReferred === 1 ? 'friend' : 'friends'}`}
              size="sm"
              className="mt-2 text-muted-foreground"
            />
          </section>

          <section className="m-4 rounded-card bg-surface p-5 text-center shadow-card">
            <BilingualText ta="உங்கள் குறியீடு" en="Your code" size="sm" />
            <div
              className="mt-1 text-[28px] font-bold tracking-wider"
              style={{ color: 'var(--skin-bharat-marigold)' }}
            >
              RAVEE-X91Z
            </div>
          </section>

          <section aria-label="Share via" className="mx-4 grid grid-cols-3 gap-3">
            <ShareTile icon={<MessageCircle className="size-6" />} ta="வாட்ஸ்அப்" en="WhatsApp" />
            <ShareTile icon={<Phone className="size-6" />} ta="அழைப்பு" en="Call" />
            <ShareTile icon={<Share2 className="size-6" />} ta="பகிர்" en="Share" />
          </section>
        </>
      )}
    </div>
  );
}

function ShareTile({ icon, ta, en }: { icon: React.ReactNode; ta: string; en: string }) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-2 rounded-card bg-surface p-4 shadow-card"
    >
      <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">{icon}</div>
      <BilingualText ta={ta} en={en} size="sm" />
    </button>
  );
}

export default BharatReferralsPage;
