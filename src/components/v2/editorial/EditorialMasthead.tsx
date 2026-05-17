interface EditorialMastheadProps {
  issue: string;
  title: string;
  subtitle: string;
}

/**
 * Magazine masthead. Two thin rules, oversized italic serif title, a
 * line of metadata. Same role as a page header — but theatrical.
 */
export function EditorialMasthead({ issue, title, subtitle }: EditorialMastheadProps) {
  return (
    <header className="border-b-2 border-foreground/80 pb-5 pt-7">
      <div className="mb-3 flex items-baseline justify-between border-b border-border pb-1">
        <span className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          TripKing &nbsp;·&nbsp; the route journal
        </span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{issue}</span>
      </div>
      <h1 className="editorial-headline text-[40px] leading-[0.95]">{title}</h1>
      <p className="mt-3 text-[13px] italic text-muted-foreground">{subtitle}</p>
    </header>
  );
}

export default EditorialMasthead;
