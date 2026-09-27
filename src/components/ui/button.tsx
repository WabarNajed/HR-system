import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium select-none',
    'transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out',
    'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none',
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    'aria-invalid:border-danger aria-invalid:ring-danger/20',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        secondary: 'bg-muted text-foreground hover:bg-accent dark:bg-muted dark:hover:bg-accent',
        outline:
          'border border-border-strong bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-transparent dark:hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'h-auto! px-0! text-primary underline-offset-4 hover:underline active:scale-100',
        destructive: 'bg-danger text-danger-foreground shadow-xs hover:bg-danger/90 focus-visible:ring-danger/40',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary/15',
      },
      size: {
        sm: "h-8 px-3 text-meta [&_svg:not([class*='size-'])]:size-3.5 gap-1.5",
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-10 px-5 text-sm',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-xs': "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next `<Link>`) with button styles. */
    asChild?: boolean;
    /** Shows a spinner, sets aria-busy and disables the button. */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? 'default'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
