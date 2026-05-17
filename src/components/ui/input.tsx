import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputTone = 'default' | 'accent';

export interface InputProps extends React.ComponentProps<'input'> {
  /** `default` — white background (today's look). `accent` — soft emerald tint so form fields
   * pop on a busy page. Both share the same border, radius, and focus ring. */
  tone?: InputTone;
}

const toneStyles: Record<InputTone, string> = {
  default: 'bg-background',
  accent: 'bg-emerald-50/60 focus-visible:bg-background',
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, tone = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          // UI redesign — rounded-control token (12px) replaces the per-instance rounded-lg.
          'flex h-11 w-full rounded-control border border-input px-3 py-2 text-base shadow-xs',
          toneStyles[tone],
          'placeholder:text-muted-foreground transition-[color,box-shadow,background-color] outline-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
