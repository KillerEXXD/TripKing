import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * v2 Editorial — post-trip as a "submission to the editor". Underline
 * inputs, italic placeholder text, all on warm cream with a serif
 * masthead. Submitting "files the dispatch".
 */
export function EditorialPostTripPage() {
  return (
    <div className="mx-auto max-w-md px-6 pb-16">
      <Link to="/v5" aria-label="Back" className="m-3 -ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <ArrowLeft className="size-3" /> the journal
      </Link>
      <header className="border-b-2 border-foreground/80 pb-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">File a submission</div>
        <h1 className="editorial-headline mt-2 text-[32px] leading-tight">New trip</h1>
        <p className="mt-2 text-[13px] italic text-muted-foreground">
          Tell us where it begins, where it ends, and what's at stake.
        </p>
      </header>
      <form className="mt-6 space-y-7" onSubmit={(e) => e.preventDefault()}>
        <Field label="The starting point" placeholder="Vellore" />
        <Field label="The destination" placeholder="Chennai" />
        <Field label="Date and hour" placeholder="Tomorrow, half past two" />
        <Field label="The vessel" placeholder="Sedan, four seats" />
        <Field label="Tariff per kilometre" placeholder="₹14" />
        <Field label="Driver's daily bata" placeholder="₹300" />
        <Field label="A note for the driver" placeholder="Optional — anything they should know" />
        <button
          type="submit"
          className="mt-4 inline-flex items-center gap-2 border-b border-foreground pb-1 text-[14px] tracking-wide hover:text-primary"
        >
          File the dispatch →
        </button>
      </form>
    </div>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <input
        placeholder={placeholder}
        className="editorial-headline mt-1 block w-full border-0 border-b border-foreground/40 bg-transparent pb-1 text-[20px] outline-none placeholder:italic placeholder:text-muted-foreground/50 focus:border-foreground"
      />
    </label>
  );
}

export default EditorialPostTripPage;
