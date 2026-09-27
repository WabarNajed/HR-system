import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-sm border font-medium whitespace-nowrap',
    "transition-colors [&>svg]:pointer-events-none [&>svg:not([class*='size-'])]:size-3.5",
    'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
  ],
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-soft text-primary-soft-foreground',
        solid: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary-soft text-secondary-soft-foreground',
        outline: 'border-border-strong bg-transparent text-foreground',
        success: 'border-transparent bg-success-soft text-success-soft-foreground',
        warning: 'border-transparent bg-warning-soft text-warning-soft-foreground',
        danger: 'border-transparent bg-danger-soft text-danger-soft-foreground',
        info: 'border-transparent bg-info-soft text-info-soft-foreground',
        neutral: 'border-transparent bg-neutral-soft text-neutral-soft-foreground',
      },
      size: {
        sm: 'h-5 px-1.5 text-[0.75rem] leading-none',
        md: 'h-6 px-2 text-xs',
        lg: 'h-7 px-2.5 text-meta',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

const dotColor: Record<NonNullable<VariantProps<typeof badgeVariants>['variant']>, string> = {
  default: 'bg-primary',
  solid: 'bg-primary-foreground',
  secondary: 'bg-secondary',
  outline: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
};

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** Leading status dot in the variant's tone. */
    dot?: boolean;
  };

function Badge({ className, variant, size, asChild = false, dot = false, children, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && !asChild ? (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dotColor[variant ?? 'default'])} />
      ) : null}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
