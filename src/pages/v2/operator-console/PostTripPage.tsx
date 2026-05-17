import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * v2 Operator — post-trip form. Single-screen, dense, tabular. Labels
 * tight, inputs full-width, every field visible without scroll on a
 * laptop. (Form is presentational — prototype only.)
 */
export function OperatorPostTripPage() {
  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold">New trip</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">DRAFT</span>
      </header>
      <form className="divide-y divide-border text-[13px]" onSubmit={(e) => e.preventDefault()}>
        <Field label="From city" placeholder="Vellore" />
        <Field label="To city" placeholder="Chennai" />
        <Field label="Pickup at" type="datetime-local" />
        <Field label="Vehicle" placeholder="Sedan · 4 seats" />
        <Field label="Distance (km)" type="number" placeholder="138" />
        <Field label="Rate per km (₹)" type="number" placeholder="14" />
        <Field label="Driver bata (₹)" type="number" placeholder="300" />
        <Field label="Commission %" type="number" placeholder="10" />
        <Field label="GST %" type="number" placeholder="5" />
        <Field label="Passenger name" placeholder="—" />
        <Field label="Passenger phone" placeholder="+91 …" type="tel" />
        <Field label="Notes" placeholder="Driver instructions" />
      </form>
      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-2">
        <button type="button" className="flex-1 rounded-control border border-border px-3 py-2 text-[13px]">Save draft</button>
        <button type="submit" className="flex-1 rounded-control bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground">
          Post trip
        </button>
      </div>
    </div>
  );
}

function Field({ label, placeholder, type = 'text' }: { label: string; placeholder?: string; type?: string }) {
  return (
    <label className="grid grid-cols-[40%_60%] items-center gap-3 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full bg-transparent text-right text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

export default OperatorPostTripPage;
