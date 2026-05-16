import type { TripStatus } from '@/types';

export interface ColumnDef {
  status: TripStatus;
  label: string;
}

export const PIPELINE_COLUMNS: ColumnDef[] = [
  { status: 'open', label: 'Open' },
  { status: 'has_applicants', label: 'Has applicants' },
  { status: 'accepted', label: 'Assigned' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'completed', label: 'Completed' },
];

interface ColumnChipsProps {
  active: TripStatus;
  counts: Partial<Record<TripStatus, number>>;
  onChange: (status: TripStatus) => void;
}

export function ColumnChips({ active, counts, onChange }: ColumnChipsProps) {
  return (
    <div role="tablist" aria-label="Pipeline columns" className="flex gap-2 overflow-x-auto px-4 py-3">
      {PIPELINE_COLUMNS.map((col) => {
        const isActive = col.status === active;
        return (
          <button
            key={col.status}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(col.status)}
            className={`shrink-0 rounded-pill border px-3 py-1.5 text-[13px] transition-colors ${
              isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-foreground hover:border-primary/40'
            }`}
          >
            {col.label} <span className={isActive ? 'opacity-80' : 'text-muted-foreground'}>{counts[col.status] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ColumnChips;
