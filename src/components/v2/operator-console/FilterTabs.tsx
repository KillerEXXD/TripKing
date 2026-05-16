import type { TripStatus } from '@/types';

export type FilterTab = 'all' | TripStatus;

interface FilterTabsProps {
  active: FilterTab;
  counts: Partial<Record<FilterTab, number>>;
  onChange: (tab: FilterTab) => void;
}

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'has_applicants', label: 'Has applicants' },
  { id: 'accepted', label: 'Assigned' },
  { id: 'in_progress', label: 'In progress' },
];

export function FilterTabs({ active, counts, onChange }: FilterTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filter trips by status"
      className="flex gap-1 overflow-x-auto border-b border-border px-3 text-[13px]"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`-mb-px shrink-0 border-b-2 px-2 py-2 transition-colors ${
              isActive
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {typeof count === 'number' ? (
              <span className="ml-1.5 text-muted-foreground">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default FilterTabs;
