import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs',
        'transition-[border-color,box-shadow] outline-none placeholder:text-faint-foreground',
        'hover:border-border-strong dark:bg-input/20',
        'focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        'aria-invalid:border-danger aria-invalid:ring-danger/15',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
