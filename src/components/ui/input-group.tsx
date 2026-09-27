import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Input with leading/trailing adornments (icons, units, buttons). Adornments sit at the logical
 * start/end so they mirror in RTL.
 *
 *   <InputGroup start={<SearchIcon />} end={<Kbd>⌘K</Kbd>} placeholder="…" />
 */
type InputGroupProps = ComponentProps<typeof Input> & {
  start?: ReactNode;
  end?: ReactNode;
  /** Class for the outer wrapper. */
  wrapperClassName?: string;
  /** Make the end adornment clickable (buttons); icons are pointer-events-none by default. */
  interactiveEnd?: boolean;
};

function InputGroup({ start, end, wrapperClassName, className, interactiveEnd = false, dir, ...props }: InputGroupProps) {
  // A `dir` on the input (e.g. LTR email/phone inside an RTL form) also flips the adornments.
  return (
    <div data-slot="input-group" dir={dir} className={cn('relative flex w-full items-center', wrapperClassName)}>
      {start ? (
        <span
          data-slot="input-group-start"
          className="pointer-events-none absolute start-0 flex h-full items-center ps-3 text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
        >
          {start}
        </span>
      ) : null}
      <Input dir={dir} className={cn(start && 'ps-9', end && 'pe-10', className)} {...props} />
      {end ? (
        <span
          data-slot="input-group-end"
          className={cn(
            'absolute end-0 flex h-full items-center pe-2 text-muted-foreground [&_svg:not([class*=\'size-\'])]:size-4',
            !interactiveEnd && 'pointer-events-none pe-3',
          )}
        >
          {end}
        </span>
      ) : null}
    </div>
  );
}

/** Static text addon attached to an input (e.g. currency "SAR" or "SA" IBAN prefix). */
function InputAddon({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="input-addon"
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-md border border-input bg-muted px-3 text-meta text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { InputAddon, InputGroup };
