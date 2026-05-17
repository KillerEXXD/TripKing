import { Link } from 'react-router-dom';
import { ChevronLeft, Clock, Phone, MapPin, Users } from 'lucide-react';

/** v3 Field Companion — Home-tab scenario cards. Big, glanceable. */
export function FieldHomeScenariosPage() {
  return (
    <div className="min-h-dvh pb-10">
      <header className="flex items-center gap-3 px-5 pt-4">
        <Link to="/v3" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[22px] font-bold">Scenarios</h1>
      </header>
      <div className="space-y-6 px-5 pt-6">

        <ScenarioLabel>Driver · currently driving</ScenarioLabel>
        <Link to="/v3/trips" className="block rounded-card bg-surface p-6 shadow-card">
          <div className="text-[12px] uppercase tracking-wide text-primary">En route</div>
          <div className="mt-1 text-[26px] font-bold leading-tight">Vellore → Chennai</div>
          <div className="mt-3 flex items-center justify-between text-[14px] text-muted-foreground">
            <span><Clock className="inline size-4" aria-hidden /> ETA 6:15 PM</span>
            <span>42 km left</span>
          </div>
          <div className="mt-4 rounded-control bg-page p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">OTP from passenger</div>
            <div className="mt-1 text-[28px] font-bold tracking-[0.3em]">4821</div>
          </div>
        </Link>

        <ScenarioLabel>Agent · 1 trip in progress</ScenarioLabel>
        <Link to="/v3/trips" className="block rounded-card bg-surface p-5 shadow-card">
          <div className="text-[12px] uppercase tracking-wide text-primary">Live</div>
          <div className="mt-1 text-[20px] font-semibold leading-tight">Vellore → Chennai</div>
          <div className="mt-2 flex items-center gap-2 text-[14px] text-muted-foreground">
            <Users className="size-4" /> Karthik M · 42 km to drop · ETA 6:15
          </div>
        </Link>

        <ScenarioLabel>Agent · 3 trips in progress</ScenarioLabel>
        <Link to="/v3/trips" className="block rounded-card bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] uppercase tracking-wide text-primary">All running</div>
              <div className="mt-1 text-[28px] font-bold leading-none">3</div>
              <div className="mt-1 text-[14px] text-muted-foreground">trips in progress</div>
            </div>
            <div className="space-y-1 text-right text-[12px] text-muted-foreground">
              <div>Vellore → Chennai · 42 km</div>
              <div>Bangalore → Tirupati · 88 km</div>
              <div>Salem → Coimbatore · arriving</div>
            </div>
          </div>
        </Link>

        <ScenarioLabel>Driver · selected for 3 trips · book before 18 min</ScenarioLabel>
        <Link to="/v3/my-trips" className="block rounded-card bg-primary p-6 text-primary-foreground shadow-fab">
          <div className="text-[14px] uppercase tracking-wide opacity-80">Trip managers picked you</div>
          <div className="mt-1 text-[40px] font-bold leading-none">3 trips</div>
          <div className="mt-3 text-[15px] opacity-90">Book the one you can run. Oldest expires in 18 min.</div>
          <div className="mt-4 inline-flex items-center justify-center rounded-control bg-white px-4 py-2 text-[15px] font-bold text-primary">
            Book a trip →
          </div>
        </Link>

        <ScenarioLabel>Agent · 4 applications across 2 trips</ScenarioLabel>
        <Link to="/v3/trips" className="flex items-center gap-4 rounded-card bg-surface p-5 shadow-card">
          <div className="grid size-14 place-items-center rounded-pill bg-primary/15 text-primary">
            <span className="text-[24px] font-bold">4</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold leading-tight">New applications</div>
            <div className="mt-0.5 text-[13px] text-muted-foreground">across 2 of your trips</div>
          </div>
          <span className="text-[12px] uppercase tracking-wide text-primary">Review</span>
        </Link>

        <ScenarioLabel>Live tracking · driver moving</ScenarioLabel>
        <article className="rounded-card bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div className="text-[12px] uppercase tracking-wide text-primary">Tracking · live</div>
            <div className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="inline-block size-2 animate-pulse rounded-full bg-emerald-500" /> 4s ago
            </div>
          </div>
          <div className="mt-3 h-28 overflow-hidden rounded-control bg-page">
            <svg viewBox="0 0 320 112" className="h-full w-full text-muted-foreground" aria-hidden>
              <path d="M 20 90 Q 100 96 150 56 T 290 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" />
              <circle cx="20" cy="90" r="4" fill="currentColor" />
              <circle cx="290" cy="18" r="5" fill="#ff6a3d" />
              <circle cx="170" cy="50" r="7" fill="#0b1d3a" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat label="To drop" value="42 km" />
            <Stat label="ETA" value="6:15 PM" />
            <Stat label="Speed" value="58 km/h" />
          </div>
        </article>

        <ScenarioLabel>Trip detail · after assignment (driver view)</ScenarioLabel>
        <article className="rounded-card bg-surface p-5 shadow-card">
          <div className="text-[12px] uppercase tracking-wide text-primary">You're assigned · pickup at 2:30 PM</div>
          <div className="mt-1 text-[24px] font-bold leading-tight">Vellore → Chennai</div>
          <div className="mt-4 rounded-control border border-border bg-page p-4 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Passenger OTP</div>
            <div className="mt-1 text-[36px] font-bold tracking-[0.3em]">4821</div>
            <div className="mt-1 text-[12px] text-muted-foreground">Ask passenger before starting</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href="tel:+910" className="flex items-center justify-center gap-2 rounded-control bg-page p-3 text-[14px] font-semibold">
              <Phone className="size-4" /> Call passenger
            </a>
            <a href="#" className="flex items-center justify-center gap-2 rounded-control bg-page p-3 text-[14px] font-semibold">
              <MapPin className="size-4" /> Open map
            </a>
          </div>
          <button
            type="button"
            className="mt-3 h-12 w-full rounded-control bg-primary text-[16px] font-semibold text-primary-foreground shadow-fab"
          >
            Start trip with OTP
          </button>
        </article>
      </div>
    </div>
  );
}

function ScenarioLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[16px] font-semibold">{value}</div>
    </div>
  );
}

export default FieldHomeScenariosPage;
