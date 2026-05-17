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
          <div className="text-[22px] font-bold">Examples</div>
          <div className="text-[14px] text-muted-foreground">How cards look in different situations</div>
        </div>
      </header>

      <div className="space-y-6 px-5 pt-3">
        <Label title="Driver — you are driving now" />
        <article className="rounded-card border-4 border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] p-5">
          <div className="text-[16px] font-bold text-[var(--skin-simple-go)]">Driving — on the way</div>
          <div className="mt-1 text-[24px] font-bold leading-tight">Vellore → Chennai</div>
          <div className="mt-3 rounded-control border-2 border-border bg-surface p-4 text-center">
            <div className="text-[13px] text-muted-foreground">Ask the passenger this number</div>
            <div className="mt-1 text-[40px] font-extrabold tracking-[0.25em]">4821</div>
          </div>
          <div className="mt-3 flex gap-2">
            <a href="tel:+910" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control bg-surface text-[14px] font-bold">
              <Phone className="size-4" /> Call
            </a>
            <a href="#" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control bg-surface text-[14px] font-bold">
              <MapPin className="size-4" /> Map
            </a>
          </div>
        </article>

        <Label title="Agent — 1 driver is on the way" />
        <article className="rounded-card border-2 border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] p-4">
          <div className="text-[18px] font-bold">Vellore → Chennai</div>
          <div className="text-[13px] text-muted-foreground">Karthik driving · 42 km to go</div>
        </article>

        <Label title="Agent — 3 trips going now" />
        <article className="rounded-card border-2 border-border bg-surface p-4">
          <div className="text-[14px] font-bold">All running</div>
          <div className="text-[40px] font-extrabold leading-none text-[var(--skin-simple-go)]">3</div>
          <div className="mt-1 text-[14px] text-muted-foreground">trips on the road</div>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li className="flex items-center justify-between"><span>Vellore → Chennai</span><span className="text-muted-foreground">42 km</span></li>
            <li className="flex items-center justify-between"><span>Bangalore → Tirupati</span><span className="text-muted-foreground">88 km</span></li>
            <li className="flex items-center justify-between"><span>Salem → Coimbatore</span><span className="text-muted-foreground">arriving</span></li>
          </ul>
        </article>

        <Label title="Driver — you were picked for 3 trips" />
        <Link
          to="/v7/my-trips"
          className="block rounded-card border-4 border-[var(--skin-simple-stop)] bg-[var(--skin-simple-stop-bg)] p-5"
        >
          <div className="flex items-center gap-2 text-[16px] font-bold text-[var(--skin-simple-stop)]">
            <Clock className="size-5" /> Choose now
          </div>
          <div className="text-[13px] text-muted-foreground">Book now — wait time ends in 18 minutes</div>
          <div className="mt-2 text-[44px] font-extrabold leading-none">3</div>
          <div className="mt-1 text-[14px] text-muted-foreground">trips waiting for your answer</div>
          <div className="mt-3 flex h-12 items-center justify-center rounded-control bg-[var(--skin-simple-stop)] text-[16px] font-bold text-white">
            Book now
          </div>
        </Link>

        <Label title="Agent — 4 drivers want your trips" />
        <Link to="/v7/trips" className="flex items-center gap-4 rounded-card border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-4">
          <div className="grid size-14 place-items-center rounded-pill bg-[var(--skin-simple-wait)] text-white text-[26px] font-bold">4</div>
          <div>
            <div className="text-[16px] font-bold">New driver requests</div>
            <div className="text-[13px] text-muted-foreground">On 2 of your trips · tap to pick one</div>
          </div>
        </Link>

        <Label title="Live — where the driver is now" />
        <article className="rounded-card border-2 border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-bold">Moving now</div>
            <div className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <span className="inline-block size-2 animate-pulse rounded-full bg-[var(--skin-simple-go)]" /> updated 4s ago
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
              <div className="text-[12px] text-muted-foreground">Left</div>
              <div className="text-[18px] font-extrabold">42 km</div>
            </div>
            <div>
              <div className="text-[12px] text-muted-foreground">Reach</div>
              <div className="text-[18px] font-extrabold">6:15</div>
            </div>
            <div>
              <div className="text-[12px] text-muted-foreground">Speed</div>
              <div className="text-[18px] font-extrabold">58</div>
            </div>
          </div>
        </article>

        <Label title="After you say yes — start the trip" />
        <article className="rounded-card border-4 border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)] p-5">
          <div className="text-[16px] font-bold text-[var(--skin-simple-go)]">Trip is yours · pickup at 2:30 PM</div>
          <div className="mt-1 text-[22px] font-bold">Vellore → Chennai</div>
          <div className="mt-3 rounded-control border-2 border-border bg-surface p-5 text-center">
            <div className="text-[13px] text-muted-foreground">Ask the passenger this number</div>
            <div className="mt-2 text-[48px] font-extrabold leading-none tracking-[0.22em]">4821</div>
            <div className="mt-2 text-[14px] text-muted-foreground">Only start after they tell you</div>
          </div>
          <button
            type="button"
            className="mt-3 h-14 w-full rounded-control bg-[var(--skin-simple-go)] text-[17px] font-bold text-white"
          >
            ✓ Start the trip
          </button>
        </article>
      </div>
    </div>
  );
}

function Label({ title }: { title: string }) {
  return (
    <div className="px-1">
      <div className="text-[15px] font-bold text-foreground">{title}</div>
    </div>
  );
}

export default SimpleHomeScenariosPage;
