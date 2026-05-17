import { Link } from 'react-router-dom';
import { ChevronLeft, Phone, MapPin, Clock } from 'lucide-react';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';

/** v6 Bharat — Home-tab scenario cards, Tamil-first bilingual. */
export function BharatHomeScenariosPage() {
  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="bg-primary px-4 pb-4 pt-4 text-primary-foreground">
        <Link to="/v6" aria-label="Back" className="mb-3 inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <BilingualText as="h1" ta="காட்சிகள்" en="Scenarios" size="lg" />
      </header>

      <div className="space-y-5 p-4">

        <Label ta="ஓட்டுதல் — Driver currently driving" en="Driver · currently driving" />
        <article className="rounded-card bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <BilingualText ta="நடந்துகொண்டிருக்கிறது" en="En route" size="sm" />
            <div className="rounded-pill bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">LIVE</div>
          </div>
          <div className="mt-1 text-[22px] font-semibold leading-tight">வேலூர் → சென்னை</div>
          <div className="text-[13px] text-muted-foreground">Vellore → Chennai</div>
          <div className="mt-3 rounded-control bg-surface-muted p-4 text-center">
            <BilingualText ta="ஓ.டி.பி." en="Passenger OTP" size="sm" />
            <div
              className="mt-1 text-[32px] font-bold tracking-[0.3em]"
              style={{ color: 'var(--skin-bharat-vermilion)' }}
            >
              4821
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-muted-foreground">
            <span><Clock className="inline size-3" /> 6:15 PM</span>
            <span className="text-center"><MapPin className="inline size-3" /> 42 km</span>
            <span className="text-right">₹4,200</span>
          </div>
        </article>

        <Label ta="ஒரு டிரிப் — Single in progress" en="Agent · 1 trip in progress" />
        <Link to="/v6/trips" className="flex items-center justify-between rounded-card bg-surface p-4 shadow-card">
          <div>
            <div className="text-[18px] font-semibold leading-tight">வேலூர் → சென்னை</div>
            <div className="text-[12px] text-muted-foreground">Karthik M · 42 km to drop</div>
          </div>
          <div className="rounded-pill bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">LIVE</div>
        </Link>

        <Label ta="மூன்று டிரிப்கள் — 3 in progress" en="Agent · 3 trips in progress" />
        <article className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <BilingualText ta="ஓடிக்கொண்டிருப்பது" en="Running now" size="sm" />
            <div
              className="rounded-pill px-2 py-0.5 text-[12px] font-bold"
              style={{ background: 'var(--skin-bharat-marigold-bg)', color: 'var(--skin-bharat-marigold)' }}
            >
              3
            </div>
          </div>
          <ul className="mt-2 space-y-1.5 text-[14px]">
            <li className="flex items-center justify-between"><span>வேலூர் → சென்னை</span><span className="text-[11px] text-muted-foreground">42 km</span></li>
            <li className="flex items-center justify-between"><span>பெங்களூரு → திருப்பதி</span><span className="text-[11px] text-muted-foreground">88 km</span></li>
            <li className="flex items-center justify-between"><span>சேலம் → கோயம்புத்தூர்</span><span className="text-[11px] text-muted-foreground">வருகிறது</span></li>
          </ul>
        </article>

        <Label ta="3 டிரிப்களுக்கு தேர்வு" en="Driver · selected for 3 trips" />
        <Link
          to="/v6/my-trips"
          className="block rounded-card p-5 text-primary-foreground shadow-card"
          style={{ background: 'var(--skin-bharat-vermilion)' }}
        >
          <BilingualText ta="நீங்கள் தேர்வாகியுள்ளீர்கள்" en="You've been selected" size="sm" className="opacity-90" />
          <div className="mt-1 text-[44px] font-bold leading-none">3</div>
          <div className="mt-2 text-[14px] opacity-90">டிரிப்களுக்கு · trips waiting for your booking</div>
          <div className="mt-3 inline-flex items-center justify-center rounded-control bg-white px-4 py-2 text-[15px] font-bold" style={{ color: 'var(--skin-bharat-vermilion)' }}>
            இப்போது புக் செய் · Book now
          </div>
        </Link>

        <Label ta="4 விண்ணப்பங்கள் — Applications" en="Agent · 4 applications · 2 trips" />
        <Link to="/v6/trips" className="flex items-center gap-4 rounded-card bg-surface p-4 shadow-card">
          <div
            className="grid size-14 place-items-center rounded-pill text-primary-foreground"
            style={{ background: 'var(--skin-bharat-marigold)' }}
          >
            <span className="text-[22px] font-bold">4</span>
          </div>
          <div className="min-w-0 flex-1">
            <BilingualText ta="புதிய விண்ணப்பங்கள்" en="New applications" size="md" />
            <div className="mt-0.5 text-[12px] text-muted-foreground">2 டிரிப்கள் · across 2 trips</div>
          </div>
        </Link>

        <Label ta="நேரடி கண்காணிப்பு" en="Live tracking" />
        <article className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <BilingualText ta="நகர்ந்துகொண்டிருக்கிறது" en="On the move" size="sm" />
            <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" /> 4s ago
            </div>
          </div>
          <div className="mt-2 h-24 overflow-hidden rounded-control bg-surface-muted">
            <svg viewBox="0 0 320 96" className="h-full w-full text-muted-foreground" aria-hidden>
              <path d="M 20 78 Q 80 82 130 48 T 280 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
              <circle cx="20" cy="78" r="4" fill="currentColor" />
              <circle cx="280" cy="16" r="5" fill="#dc2626" />
              <circle cx="160" cy="44" r="6" fill="#312e81" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <BilingualText ta="மீதி" en="To drop" size="sm" />
              <div className="mt-0.5 text-[16px] font-bold" style={{ color: 'var(--skin-bharat-vermilion)' }}>42 km</div>
            </div>
            <div>
              <BilingualText ta="நேரம்" en="ETA" size="sm" />
              <div className="mt-0.5 text-[16px] font-bold">6:15 PM</div>
            </div>
            <div>
              <BilingualText ta="வேகம்" en="Speed" size="sm" />
              <div className="mt-0.5 text-[16px] font-bold">58 km/h</div>
            </div>
          </div>
        </article>

        <Label ta="ஒதுக்கப்பட்ட டிரிப்" en="Trip detail · after assignment" />
        <article className="rounded-card bg-surface p-5 shadow-card">
          <BilingualText ta="உங்களுக்கு ஒதுக்கப்பட்டது" en="Assigned to you" size="sm" />
          <div className="mt-1 text-[24px] font-semibold leading-tight">வேலூர் → சென்னை</div>
          <div className="text-[13px] text-muted-foreground">Vellore → Chennai</div>
          <div className="mt-4 rounded-control bg-surface-muted p-5 text-center">
            <BilingualText ta="பயணி ஓ.டி.பி." en="Passenger OTP" size="sm" />
            <div
              className="mt-2 text-[44px] font-bold leading-none tracking-[0.3em]"
              style={{ color: 'var(--skin-bharat-vermilion)' }}
            >
              4821
            </div>
            <BilingualText ta="பயணியிடம் கேட்கவும்" en="Ask the passenger" size="sm" className="mt-2 text-muted-foreground" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="tel:+910" className="flex items-center justify-center gap-2 rounded-control bg-surface-muted p-3 text-[14px] font-semibold">
              <Phone className="size-4" /> அழை · Call
            </a>
            <a href="#" className="flex items-center justify-center gap-2 rounded-control bg-surface-muted p-3 text-[14px] font-semibold">
              <MapPin className="size-4" /> வரைபடம் · Map
            </a>
          </div>
          <button
            type="button"
            className="mt-3 h-12 w-full rounded-control text-[15px] font-semibold text-primary-foreground"
            style={{ background: 'var(--skin-bharat-vermilion)' }}
          >
            டிரிப் தொடங்கு · Start trip
          </button>
        </article>
      </div>
    </div>
  );
}

function Label({ ta, en }: { ta: string; en: string }) {
  return (
    <div className="px-1 pt-2">
      <BilingualText ta={ta} en={en} size="sm" className="text-muted-foreground" />
    </div>
  );
}

export default BharatHomeScenariosPage;
