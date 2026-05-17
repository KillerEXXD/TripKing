import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { StatusDot } from '@/components/v2/operator-console/StatusDot';

/** v2 Operator — high-priority Home-tab scenario cards in this direction's idiom. */
export function OperatorHomeScenariosPage() {
  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold">Home — scenario cards</span>
      </header>

      <Section label="Driver · currently driving">
        <Link to="/v2/trips" className="block border-b border-border px-3 py-3 hover:bg-surface-muted">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <StatusDot status="in_progress" />
              <span className="text-[11px] font-mono uppercase text-muted-foreground">EN ROUTE · TRP-4821</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-600">ETA 18:15</span>
          </div>
          <div className="mt-1 text-[15px] font-semibold">Vellore → Chennai</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <Cell label="OTP" value="4821" mono />
            <Cell label="Payout" value="₹4,200" />
            <Cell label="To drop" value="42 km" />
          </div>
        </Link>
      </Section>

      <Section label="Agent · 1 trip in progress">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-3 text-[13px]">
          <StatusDot status="in_progress" />
          <div>
            <div className="font-medium">TRP-4821 · Vellore → Chennai</div>
            <div className="text-[11px] text-muted-foreground">Karthik M · 42 km to drop · on time</div>
          </div>
          <Link to="/v2/trips" className="text-[11px] uppercase tracking-wide text-primary">View</Link>
        </div>
      </Section>

      <Section label="Agent · 3 trips in progress">
        {[
          { id: 'TRP-4821', route: 'Vellore → Chennai', driver: 'Karthik M', km: '42 km', state: 'in_progress' as const },
          { id: 'TRP-4822', route: 'Bangalore → Tirupati', driver: 'Suresh A', km: '88 km', state: 'in_progress' as const },
          { id: 'TRP-4818', route: 'Salem → Coimbatore', driver: 'Vignesh P', km: '12 km · arriving', state: 'in_progress' as const },
        ].map((t) => (
          <div key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2 text-[13px]">
            <StatusDot status={t.state} />
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] uppercase text-muted-foreground">{t.id}</div>
              <div className="truncate">{t.route}</div>
              <div className="text-[11px] text-muted-foreground">{t.driver} · {t.km}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </div>
        ))}
      </Section>

      <Section label="Driver · selected for 3 trips · respond soon">
        <Link to="/v2/my-trips" className="flex items-center justify-between border-b border-border bg-amber-50 px-3 py-3 text-[13px] hover:bg-amber-100">
          <div>
            <div className="inline-flex items-center gap-2 font-semibold">
              <StatusDot status="has_applicants" /> 3 selections waiting
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              <Clock className="inline size-3" /> oldest · 12 min · expires in 18 min
            </div>
          </div>
          <button type="button" className="rounded-control bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">
            Book →
          </button>
        </Link>
      </Section>

      <Section label="Agent · 4 applications across 2 trips">
        <Link to="/v2/trips" className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-3 text-[13px] hover:bg-muted">
          <div>
            <div className="font-semibold">4 new applications</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              across 2 trips · TRP-4823 (3) · TRP-4824 (1)
            </div>
          </div>
          <button type="button" className="rounded-control bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">
            Review →
          </button>
        </Link>
      </Section>

      <Section label="Live tracking · driver position">
        <article className="border-b border-border px-3 py-3 text-[13px]">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase text-muted-foreground">
            <span>TRP-4821 · TRACKING</span>
            <span className="text-emerald-700">●  last fix 4s ago</span>
          </div>
          <div className="mt-1 text-[15px] font-semibold">Vellore → Chennai</div>
          <div className="relative mt-3 h-24 overflow-hidden rounded-control border border-border bg-page">
            <svg viewBox="0 0 320 96" className="h-full w-full text-muted-foreground" aria-hidden>
              <path d="M 20 76 Q 80 78 130 50 T 280 16" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" />
              <circle cx="20" cy="76" r="3" fill="currentColor" />
              <circle cx="280" cy="16" r="4" fill="#10b981" />
              <circle cx="158" cy="46" r="5" fill="#0a0a0a" stroke="#fff" strokeWidth="2" />
            </svg>
            <div className="absolute right-2 top-2 rounded-control bg-surface px-2 py-0.5 font-mono text-[10px] text-foreground">
              42 km · 38 min
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <Cell label="Speed" value="58 km/h" mono />
            <Cell label="On time" value="Yes" />
            <Cell label="Update" value="every 5s" />
          </div>
        </article>
      </Section>

      <Section label="Trip detail · post-assignment (driver view)">
        <article className="border-b border-border bg-emerald-50 px-3 py-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase text-emerald-700">TRP-4821 · ASSIGNED</span>
            <span className="text-[11px] text-emerald-700">Start when ready</span>
          </div>
          <div className="mt-1 text-[15px] font-semibold">Vellore → Chennai</div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <Cell label="Passenger OTP" value="4821" mono accent />
            <Cell label="Passenger" value="Anand · masked" />
            <Cell label="Pickup" value="14:30" />
            <Cell label="Payout" value="₹4,200" />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="flex-1 rounded-control border border-border px-3 py-1.5 text-[12px]">Call passenger</button>
            <button type="button" className="flex-1 rounded-control bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">
              Start trip
            </button>
          </div>
        </article>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="bg-surface px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </section>
  );
}

function Cell({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${mono ? 'font-mono' : ''} ${accent ? 'text-emerald-700 font-bold' : ''}`}>{value}</div>
    </div>
  );
}

export default OperatorHomeScenariosPage;
