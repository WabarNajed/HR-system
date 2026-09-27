'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const toggleVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] outline-none',
    'hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
    'data-[state=on]:bg-primary-soft data-[state=on]:text-primary-soft-foreground',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-transparent text-muted-foreground',
        outline: 'border border-input bg-card text-muted-foreground shadow-xs hover:bg-accent dark:bg-transparent',
      },
      size: {
        sm: 'h-8 min-w-8 px-2 text-meta',
        md: 'h-9 min-w-9 px-2.5',
        lg: 'h-10 min-w-10 px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

function Toggle({ className, variant, size, ...props }: ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size }), className)} {...props} />;
}

export { Toggle, toggleVariants };
