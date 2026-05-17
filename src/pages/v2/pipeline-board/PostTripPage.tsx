import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * v2 Pipeline — post-trip as a card stack. Each section is its own
 * card with a section heading; submitting "moves to Open column".
 */
export function PipelinePostTripPage() {
  return (
    <div className="mx-auto max-w-md px-4 pb-12 pt-3">
      <header className="flex items-center gap-2">
        <Link to="/v4" aria-label="Back" className="rounded-control p-1">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">New trip</h1>
        <span className="ml-auto rounded-pill border border-border bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Will move to → Open
        </span>
      </header>

      <form onSubmit={(e) => e.preventDefault()} className="mt-4 space-y-3">
        <Section title="Route">
          <Field label="From" placeholder="Vellore" />
          <Field label="To" placeholder="Chennai" />
          <Field label="Pickup" type="datetime-local" />
        </Section>
        <Section title="Vehicle">
          <Field label="Type" placeholder="Sedan" />
          <Field label="Seats" type="number" placeholder="4" />
          <Field label="AC" placeholder="Yes" />
        </Section>
        <Section title="Fare">
          <Field label="Rate per km" type="number" placeholder="14" />
          <Field label="Driver bata" type="number" placeholder="300" />
          <Field label="Commission %" type="number" placeholder="10" />
        </Section>
        <Section title="Passenger">
          <Field label="Name" placeholder="—" />
          <Field label="Phone" placeholder="+91 …" type="tel" />
        </Section>

        <div className="flex gap-2 pt-2">
          <button type="button" className="flex-1 rounded-control border border-border bg-surface px-4 py-2.5 text-[14px]">
            Save draft
          </button>
          <button type="submit" className="flex-1 rounded-control bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground">
            Move to Open →
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-card bg-surface p-4 shadow-card">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-2">{children}</div>
    </article>
  );
}

function Field({ label, placeholder, type = 'text' }: { label: string; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className="mt-0.5 block h-10 w-full rounded-control border border-border bg-surface-muted px-3 text-[14px] outline-none focus:border-primary"
      />
    </label>
  );
}

export default PipelinePostTripPage;
