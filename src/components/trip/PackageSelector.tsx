import { cn } from '@/lib/utils';

/** A standard local-rental package: hired hours + the included-km cap. */
export interface PackageOption {
  hours: number;
  includedKm: number;
}

/** The Indian-market default ladder (hr/km). Mirrored in the tour explainer. */
export const PACKAGE_OPTIONS: PackageOption[] = [
  { hours: 4, includedKm: 40 },
  { hours: 6, includedKm: 60 },
  { hours: 8, includedKm: 80 },
  { hours: 10, includedKm: 100 },
  { hours: 12, includedKm: 120 },
];

export interface PackageSelectorProps {
  /** The chosen package, or `null` when none picked. */
  value: PackageOption | null;
  onChange: (next: PackageOption) => void;
  options?: PackageOption[];
  className?: string;
}

/** Pick a rental package (hours + included km). Renders the ladder as selectable pills. */
export function PackageSelector({ value, onChange, options = PACKAGE_OPTIONS, className }: PackageSelectorProps) {
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)} role="radiogroup" aria-label="Rental package">
      {options.map((o) => {
        const active = value?.hours === o.hours && value?.includedKm === o.includedKm;
        return (
          <button
            key={`${o.hours}-${o.includedKm}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o)}
            className={cn(
              'rounded-xl border px-2 py-2 text-center transition-colors',
              active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-input bg-white hover:border-primary/40',
            )}
          >
            <div className="text-sm font-bold">{o.hours} hr</div>
            <div className={cn('text-[11px]', active ? 'text-primary-foreground/80' : 'text-secondary')}>{o.includedKm} km</div>
          </button>
        );
      })}
    </div>
  );
}

export default PackageSelector;
