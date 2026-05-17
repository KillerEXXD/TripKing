import { Link } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';

/** v4 Pipeline Board — Home-tab scenario cards using column-tint metaphor. */
export function PipelineHomeScenariosPage() {
  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-3">
      <header className="flex items-center gap-2">
        <Link to="/v4" aria-label="Back" className="rounded-control p-1">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">Scenarios</h1>
      </header>

      <Section label="Driver · currently driving">
        <div data-tint="in_progress" className="mt-2 rounded-card p-3">
          <div className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In progress</div>
              <div className="rounded-pill bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">LIVE</div>
            </div>
            <div className="mt-1 text-[16px] font-semibold">Vellore → Chennai</div>
            <Stages active={3} />
            <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-muted-foreground">
              <span>ETA 6:15 PM</span>
              <span className="text-right font-mono">OTP 4821</span>
            </div>
          </div>
        </div>
      </Section>

      <Section label="Agent · 1 trip in progress">
        <div data-tint="in_progress" className="mt-2 rounded-card p-3">
          <Link to="/v4/trips" className="block rounded-card bg-surface p-3 shadow-card">
            <div className="text-[14px] font-semibold">Vellore → Chennai</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">Karthik M · 42 km to drop · on time</div>
            <Stages active={3} small />
          </Link>
        </div>
      </Section>

      <Section label="Agent · 3 trips in progress">
        <div data-tint="in_progress" className="mt-2 rounded-card p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In progress</div>
            <div className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-medium">3</div>
          </div>
          <div className="space-y-2">
            {[
              ['Vellore → Chennai', 'Karthik M · 42 km'],
              ['Bangalore → Tirupati', 'Suresh A · 88 km'],
              ['Salem → Coimbatore', 'Vignesh P · arriving'],
            ].map(([route, meta]) => (
              <Link key={route} to="/v4/trips" className="block rounded-card bg-surface p-3 shadow-card">
                <div className="text-[14px] font-semibold">{route}</div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">{meta}</div>
              </Link>
            ))}
          </div>
        </div>
      </Section>

      <Section label="Driver · 3 selections to book">
        <div data-tint="has_applicants" className="mt-2 rounded-card p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected · respond</div>
            <div className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-medium">3</div>
          </div>
          <div className="space-y-2">
            {['Vellore → Chennai · 2:30 PM', 'Bangalore → Mysore · 9:00 PM', 'Tirupati → Chennai · tomorrow'].map((t) => (
              <article key={t} className="flex items-center justify-between rounded-card bg-surface p-3 shadow-card">
                <div className="text-[13px]">{t}</div>
                <button type="button" className="rounded-control bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">Book</button>
              </article>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Will move to → Assigned</p>
        </div>
      </Section>

      <Section label="Agent · 4 applications · 2 trips">
        <div data-tint="has_applicants" className="mt-2 rounded-card p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Has applicants</div>
            <div className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-medium">2 trips · 4 drivers</div>
          </div>
          <div className="space-y-2">
            <Link to="/v4/trips" className="block rounded-card bg-surface p-3 shadow-card">
              <div className="text-[14px] font-semibold">TRP-4823 · Vellore → Chennai</div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-pill bg-warning/15 px-2 py-0.5 text-[11px] text-warning">3 drivers</div>
            </Link>
            <Link to="/v4/trips" className="block rounded-card bg-surface p-3 shadow-card">
              <div className="text-[14px] font-semibold">TRP-4824 · Salem → Coimbatore</div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-pill bg-warning/15 px-2 py-0.5 text-[11px] text-warning">1 driver</div>
            </Link>
          </div>
        </div>
      </Section>

      <Section label="Live tracking · driver in motion">
        <div data-tint="in_progress" className="mt-2 rounded-card p-3">
          <article className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tracking</div>
              <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" /> live · 4s ago
              </div>
            </div>
            <div className="mt-2 h-24 overflow-hidden rounded-control bg-page">
              <svg viewBox="0 0 320 96" className="h-full w-full text-muted-foreground" aria-hidden>
                <path d="M 20 76 Q 80 80 130 48 T 280 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
                <circle cx="20" cy="76" r="4" fill="currentColor" />
                <circle cx="280" cy="14" r="5" fill="#4f46e5" />
                <circle cx="160" cy="42" r="6" fill="#0f172a" stroke="#fff" strokeWidth="2" />
              </svg>
            </div>
            <Stages active={3} />
            <div className="mt-2 grid grid-cols-3 gap-2 text-[12px] text-muted-foreground">
              <span>To drop · 42 km</span>
              <span className="text-center">ETA 6:15 PM</span>
              <span className="text-right">58 km/h</span>
            </div>
          </article>
        </div>
      </Section>

      <Section label="Trip detail · after assignment">
        <div data-tint="assigned" className="mt-2 rounded-card p-3">
          <article className="rounded-card bg-surface p-4 shadow-card">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned</div>
            <Stages active={2} />
            <div className="mt-1 text-[16px] font-semibold">Vellore → Chennai</div>
            <div className="mt-2 rounded-control bg-page p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Passenger OTP</div>
              <div className="mt-1 text-[28px] font-bold tracking-[0.25em]">4821</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-control border border-border bg-surface px-3 py-2 text-[12px]">Cancel</button>
              <button type="button" className="rounded-control bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground">
                Start → In progress
              </button>
            </div>
          </article>
        </div>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </section>
  );
}

function Stages({ active, small }: { active: number; small?: boolean }) {
  const LABELS = ['Open', 'Has apps', 'Assigned', 'In progress', 'Done'];
  return (
    <ol className="mt-2 flex items-center gap-1" aria-label="Trip pipeline stage">
      {LABELS.map((_, i) => {
        const done = i < active;
        const here = i === active;
        return (
          <li key={i} className="flex flex-1 items-center gap-1">
            <div
              className={`grid ${small ? 'size-4' : 'size-5'} shrink-0 place-items-center rounded-full text-[9px] font-semibold ${
                done
                  ? 'bg-primary text-primary-foreground'
                  : here
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                    : 'border border-border bg-surface text-muted-foreground'
              }`}
            >
              {done ? <Check className="size-3" /> : i + 1}
            </div>
            {i < LABELS.length - 1 ? <div className={`h-px flex-1 ${i < active ? 'bg-primary' : 'bg-border'}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default PipelineHomeScenariosPage;
