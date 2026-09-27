import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  [
    'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm',
    'has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-px [&>svg]:text-current',
  ],
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground [&>svg]:text-muted-foreground',
        info: 'border-info/20 bg-info-soft text-info-soft-foreground',
        success: 'border-success/20 bg-success-soft text-success-soft-foreground',
        warning: 'border-warning/25 bg-warning-soft text-warning-soft-foreground',
        danger: 'border-danger/20 bg-danger-soft text-danger-soft-foreground',
        destructive: 'border-danger/20 bg-danger-soft text-danger-soft-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Alert({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 min-h-5 font-semibold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid justify-items-start gap-1 text-meta opacity-90 [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

/** Actions row aligned under the text column. */
function AlertActions({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-actions" className={cn('col-start-2 mt-2 flex flex-wrap gap-2', className)} {...props} />;
}

export { Alert, AlertActions, AlertDescription, AlertTitle };
