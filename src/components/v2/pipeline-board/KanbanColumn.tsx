import type { ReactNode } from 'react';
import type { TripStatus } from '@/types';

interface KanbanColumnProps {
  status: TripStatus;
  label: string;
  count: number;
  children: ReactNode;
}

/**
 * Single kanban column. Pastel tint sourced from the `data-tint` attribute
 * (defined in tokens-pipeline-board.css so it can't drift from the scope).
 */
export function KanbanColumn({ status, label, count, children }: KanbanColumnProps) {
  return (
    <section
      data-tint={status}
      className="rounded-card p-3"
      aria-label={`${label} column`}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground">
          {count}
        </div>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default KanbanColumn;
