import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const inputBaseClass = cn(
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-xs',
  'transition-[border-color,box-shadow] outline-none',
  'placeholder:text-faint-foreground selection:bg-primary/20',
  'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
  'hover:border-border-strong dark:bg-input/20 dark:hover:border-border-strong',
  'focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
  'aria-invalid:border-danger aria-invalid:ring-danger/15 aria-invalid:focus-visible:ring-danger/25',
  'read-only:bg-subtle read-only:focus-visible:ring-0',
);

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputBaseClass, className)} {...props} />;
}

export { Input };
