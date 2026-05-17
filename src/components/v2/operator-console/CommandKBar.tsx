import { Search } from 'lucide-react';

/**
 * Prototype cmd-K affordance — visual only for the v2 trips list. Real
 * keyboard palette is out of scope this round.
 */
export function CommandKBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <Search className="size-4 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search routes, drivers, agents…"
        aria-label="Search"
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        ⌘K
      </kbd>
    </div>
  );
}

export default CommandKBar;
