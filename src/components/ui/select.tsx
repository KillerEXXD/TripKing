import * as React from 'react';
import { cn } from '@/lib/utils';

export type SelectTone = 'default' | 'accent';

export interface SelectProps extends React.ComponentProps<'select'> {
  /** Mirrors `<Input>` tone. `default` — white. `accent` — soft emerald tint. */
  tone?: SelectTone;
}

const toneStyles: Record<SelectTone, string> = {
  default: 'bg-background',
  accent: 'bg-emerald-50/60 focus-visible:bg-background',
};

/**
 * Native `<select>` with the same height, radius, border, focus ring and `tone` API as
 * `<Input>`. Replaces the per-page `selectClass = 'h-11 rounded-control border …'` string
 * everywhere a form picker is used.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, tone = 'default', children, ...props }, ref) => {
    return (
      <select
        data-slot="select"
        className={cn(
          'flex h-11 w-full rounded-control border border-input px-3 py-2 text-base shadow-xs',
          toneStyles[tone],
          'transition-[color,box-shadow,background-color] outline-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = 'Select';

export { Select };
