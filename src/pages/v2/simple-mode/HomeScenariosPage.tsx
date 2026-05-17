import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Phone, Clock } from 'lucide-react';

/** v7 Simple Mode — scenario cards demo. Same 7 sections, simple-mode aesthetic. */
export function SimpleHomeScenariosPage() {
  return (
    <div className="min-h-dvh bg-page pb-10">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div>
          <div className="text-[22px] font-bold">காட்சிகள்</div>
          <div className="text-[14px] text-muted-foreground">Examples</div>
        </div>
      </header>

      <div className="space-y-6 px-5 pt-3">
        <Label ta="நீங்கள் ஓட்டுகிறீர்கள்" en="You are driving now" />
        <article className="rounded-card border-4 border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] p-5">
          <div className="text-[16px] font-bold text-[var(--skin-simple-go)]">ஓட்டிக் கொண்டிருக்கிறீர்கள் · Driving</div>
          <div className="mt-1 text-[24px] font-bold leading-tight">வேலூர் → சென்னை</div>
          <div className="text-[13px] text-muted-foreground">Vellore → Chennai</div>
          <div className="mt-3 rounded-control border-2 border-border bg-surface p-4 text-center">
            <div className="text-[13px] text-muted-foreground">ஓ.டி.பி. · OTP</div>
            <div className="mt-1 text-[40px] font-extrabold tracking-[0.25em]">4821</div>
          </div>
          <div className="mt-3 flex gap-2">
            <a href="tel:+910" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control bg-surface text-[14px] font-bold">
              <Phone className="size-4" /> அழை
            </a>
            <a href="#" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control bg-surface text-[14px] font-bold">
              <MapPin className="size-4" /> வரைபடம்
            </a>
          </div>
        </article>

        <Label ta="ஒரு டிரிப்" en="Agent · 1 trip in progress" />
        <article className="rounded-card border-2 border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] p-4">
          <div className="text-[18px] font-bold">வேலூர் → சென்னை</div>
          <div className="text-[13px] text-muted-foreground">Driver Karthik · 42 km left</div>
        </article>

        <Label ta="மூன்று டிரிப்கள் ஓடுகிறது" en="Agent · 3 trips" />
        <article className="rounded-card border-2 border-border bg-surface p-4">
          <div className="text-[14px] font-bold">மொத்தம் · Total</div>
          <div className="text-[40px] font-extrabold leading-none text-[var(--skin-simple-go)]">3</div>
          <div className="mt-1 text-[14px] text-muted-foreground">trips running</div>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li className="flex items-center justify-between"><span>வேலூர் → சென்னை</span><span className="text-muted-foreground">42 km</span></li>
            <li className="flex items-center justify-between"><span>பெங்களூரு → திருப்பதி</span><span className="text-muted-foreground">88 km</span></li>
            <li className="flex items-center justify-between"><span>சேலம் → கோயம்புத்தூர்</span><span className="text-muted-foreground">arriving</span></li>
          </ul>
        </article>

        <Label ta="3 டிரிப்களுக்கு தேர்வாகியுள்ளீர்கள்" en="Selected for 3 trips · book now" />
        <Link
          to="/v7/my-trips"
          className="block rounded-card border-4 border-[var(--skin-simple-stop)] bg-[var(--skin-simple-stop-bg)] p-5"
        >
          <div className="flex items-center gap-2 text-[16px] font-bold text-[var(--skin-simple-stop)]">
            <Clock className="size-5" /> இப்போது புக் செய்யவும்
          </div>
          <div className="text-[13px] text-muted-foreground">Book now — wait time ends in 18 minutes</div>
          <div className="mt-2 text-[44px] font-extrabold leading-none">3</div>
          <div className="mt-1 text-[14px] text-muted-foreground">trips waiting for you</div>
          <div className="mt-3 flex h-12 items-center justify-center rounded-control bg-[var(--skin-simple-stop)] text-[16px] font-bold text-white">
            புக் செய் · Book now
          </div>
        </Link>

        <Label ta="4 விண்ணப்பங்கள் வந்துள்ளது" en="Agent · 4 applications · 2 trips" />
        <Link to="/v7/trips" className="flex items-center gap-4 rounded-card border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-4">
          <div className="grid size-14 place-items-center rounded-pill bg-[var(--skin-simple-wait)] text-white text-[26px] font-bold">4</div>
          <div>
            <div className="text-[16px] font-bold">புதிய விண்ணப்பங்கள்</div>
            <div className="text-[13px] text-muted-foreground">New driver requests on 2 of your trips</div>
          </div>
        </Link>

        <Label ta="ஓட்டுநர் எங்கே இருக்கிறார்" en="Live tracking · where the driver is" />
        <article className="rounded-card border-2 border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-bold">நகர்கிறது · Moving now</div>
            <div className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <span className="inline-block size-2 animate-pulse rounded-full bg-[var(--skin-simple-go)]" /> 4s ago
            </div>
          </div>
          <div className="mt-2 h-24 overflow-hidden rounded-control bg-surface-muted">
            <svg viewBox="0 0 320 96" className="h-full w-full text-muted-foreground" aria-hidden>
              <path d="M 20 78 Q 80 82 130 48 T 280 16" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              <circle cx="20" cy="78" r="5" fill="currentColor" />
              <circle cx="280" cy="16" r="6" fill="#16a34a" />
              <circle cx="160" cy="44" r="7" fill="#0f172a" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[12px] text-muted-foreground">மீதி · Left</div>
              <div className="text-[18px] font-extrabold">42 km</div>
            </div>
            <div>
              <div className="text-[12px] text-muted-foreground">நேரம் · Time</div>
              <div className="text-[18px] font-extrabold">6:15</div>
            </div>
            <div>
              <div className="text-[12px] text-muted-foreground">வேகம் · Speed</div>
              <div className="text-[18px] font-extrabold">58</div>
            </div>
          </div>
        </article>

        <Label ta="டிரிப் தொடங்கு" en="Trip detail · after assignment" />
        <article className="rounded-card border-4 border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] p-5">
          <div className="text-[16px] font-bold text-[var(--skin-simple-go)]">ஒதுக்கப்பட்டது · Assigned to you</div>
          <div className="mt-1 text-[22px] font-bold">வேலூர் → சென்னை</div>
          <div className="mt-3 rounded-control border-2 border-border bg-surface p-5 text-center">
            <div className="text-[13px] text-muted-foreground">பயணி ஓ.டி.பி. · Passenger OTP</div>
            <div className="mt-2 text-[48px] font-extrabold leading-none tracking-[0.22em]">4821</div>
            <div className="mt-2 text-[14px] text-muted-foreground">Ask passenger before starting</div>
          </div>
          <button
            type="button"
            className="mt-3 h-14 w-full rounded-control bg-[var(--skin-simple-go)] text-[17px] font-bold text-white"
          >
            ✓ டிரிப் தொடங்கு · Start the trip
          </button>
        </article>
      </div>
    </div>
  );
}

function Label({ ta, en }: { ta: string; en: string }) {
  return (
    <div className="px-1">
      <div className="text-[15px] font-bold text-foreground">{ta}</div>
      <div className="text-[12px] text-muted-foreground">{en}</div>
    </div>
  );
}

export default SimpleHomeScenariosPage;
