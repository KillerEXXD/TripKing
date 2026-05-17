import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** v5 Editorial — scenarios as magazine "front-page" features. */
export function EditorialHomeScenariosPage() {
  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <Link to="/v5" aria-label="Back" className="m-3 -ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <ArrowLeft className="size-3" /> the journal
      </Link>
      <header className="border-b-2 border-foreground/80 pb-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Front page</div>
        <h1 className="editorial-headline mt-1 text-[28px] leading-tight">Scenes from today</h1>
      </header>

      <Feature kicker="Currently · the driver">
        <h2 className="editorial-headline text-[24px] leading-tight">
          On the road, Vellore <span className="italic text-muted-foreground">to</span> Chennai
        </h2>
        <p className="mt-2 text-[14px] italic text-muted-foreground">
          ETA, six fifteen. The passenger, an Anand, waits with an OTP — <span className="editorial-headline not-italic text-foreground">4821</span> — that opens the trip's last act.
        </p>
        <Link to="/v5/trips" className="mt-3 inline-flex items-center gap-1 border-b border-foreground pb-0.5 text-[12px] uppercase tracking-wide">View the assignment →</Link>
      </Feature>

      <Feature kicker="From the desk · the agent">
        <h2 className="editorial-headline text-[22px] leading-tight">A single trip, moving</h2>
        <p className="mt-2 text-[13px] italic text-muted-foreground">
          Driver Karthik is forty-two kilometres from the drop, well within the hour. No interventions needed.
        </p>
      </Feature>

      <Feature kicker="Across the network">
        <h2 className="editorial-headline text-[22px] leading-tight">Three trips, all in motion</h2>
        <ul className="mt-3 divide-y divide-border text-[13px] italic">
          <li className="py-2">Vellore <span className="text-muted-foreground">to</span> Chennai · forty-two km</li>
          <li className="py-2">Bangalore <span className="text-muted-foreground">to</span> Tirupati · eighty-eight km</li>
          <li className="py-2">Salem <span className="text-muted-foreground">to</span> Coimbatore · arriving</li>
        </ul>
      </Feature>

      <Feature kicker="Breaking · the driver">
        <h2 className="editorial-headline text-[26px] leading-[1.05]">
          You've been picked. <span className="italic text-muted-foreground">Three times.</span>
        </h2>
        <p className="mt-3 text-[14px] italic text-muted-foreground">
          Three trip managers chose you in the last hour. Book the one you can run — the oldest selection expires in
          eighteen minutes.
        </p>
        <Link
          to="/v5/my-trips"
          className="mt-4 inline-flex items-center gap-2 border-b-2 border-foreground pb-0.5 text-[14px]"
        >
          Decide now →
        </Link>
      </Feature>

      <Feature kicker="The desk · pending review">
        <h2 className="editorial-headline text-[22px] leading-tight">
          Four applications, two of your trips
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-3 text-[13px]">
          <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Vellore → Chennai</dt>
          <dd className="editorial-headline text-[18px] text-right">3 drivers</dd>
          <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Salem → Coimbatore</dt>
          <dd className="editorial-headline text-[18px] text-right">1 driver</dd>
        </dl>
        <Link to="/v5/trips" className="mt-4 inline-flex items-center gap-1 border-b border-foreground pb-0.5 text-[12px] uppercase tracking-wide">Open the queue →</Link>
      </Feature>

      <Feature kicker="The dispatch · live">
        <h2 className="editorial-headline text-[22px] leading-tight">A car, somewhere between two cities</h2>
        <p className="mt-2 text-[13px] italic text-muted-foreground">
          Updated four seconds ago. The vehicle moves at fifty-eight kilometres per hour, fifty-six minutes from the
          drop, and broadly on schedule.
        </p>
        <div className="mt-4 h-32 overflow-hidden rounded-card border border-foreground/30 bg-[var(--skin-editorial-terracotta-bg)]">
          <svg viewBox="0 0 320 128" className="h-full w-full text-foreground/60" aria-hidden>
            <path d="M 20 100 Q 100 112 150 64 T 290 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" />
            <circle cx="20" cy="100" r="4" fill="currentColor" />
            <circle cx="290" cy="20" r="5" fill="#0f766e" />
            <circle cx="170" cy="60" r="6" fill="#1a1a1a" stroke="#faf7f2" strokeWidth="2" />
            <text x="32" y="116" className="fill-current text-[10px] italic">Vellore</text>
            <text x="232" y="14" className="fill-current text-[10px] italic">Chennai</text>
          </svg>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="To drop" value="42 km" />
          <Stat label="ETA" value="6:15 PM" />
          <Stat label="Speed" value="58 km/h" />
        </dl>
      </Feature>

      <Feature kicker="The dossier · assignment">
        <h2 className="editorial-headline text-[26px] leading-tight">
          Your assignment, in full
        </h2>
        <p className="mt-2 text-[14px] italic text-muted-foreground">
          Vellore to Chennai. Pickup at half past two. Begin the trip only after the passenger speaks the OTP aloud.
        </p>
        <div className="mt-5 border-y-2 border-foreground/70 py-4 text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Passenger OTP</div>
          <div className="editorial-headline mt-1 text-[40px] tracking-[0.18em] text-foreground">4821</div>
        </div>
        <div className="mt-5 flex gap-4 text-[12px] uppercase tracking-wide">
          <button type="button" className="border-b border-foreground pb-0.5 hover:text-primary">Call passenger →</button>
          <button type="button" className="border-b border-foreground pb-0.5 hover:text-primary">Begin the trip →</button>
        </div>
      </Feature>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="editorial-headline mt-1 text-[18px]">{value}</div>
    </div>
  );
}

function Feature({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <article className="border-b border-border py-7">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{kicker}</div>
      <div className="mt-2">{children}</div>
    </article>
  );
}

export default EditorialHomeScenariosPage;
