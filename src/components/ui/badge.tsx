import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-pill border px-2 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 gap-1',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-white',
        outline: 'text-foreground',
        success: 'border-transparent bg-emerald-100 text-emerald-800',
        warning: 'border-transparent bg-amber-100 text-amber-800',
        muted: 'border-transparent bg-gray-100 text-gray-700',
        info: 'border-transparent bg-blue-100 text-blue-800',
        danger: 'border-transparent bg-red-100 text-red-700',
        // UI redesign — semantic status variants (docs/UI_REDESIGN_PLAN.md §1.7).
        // Pages should prefer these named variants over the legacy success/warning/etc.;
        // ditto for inline `bg-emerald-100` pills. Backed by accent tokens, so a single
        // re-theme in src/index.css retints every status pill at once.
        open: 'border-transparent bg-green-accent-light text-green-accent',
        invited: 'border-transparent bg-blue-accent-light text-blue-accent',
        verified: 'border-transparent bg-purple-accent-light text-purple-accent',
        completed: 'border-transparent bg-grey-accent-light text-grey-accent',
        live: 'border-transparent bg-green-accent text-white',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
