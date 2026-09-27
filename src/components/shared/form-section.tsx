import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FormSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Header actions (e.g. "Copy from…"). */
  actions?: ReactNode;
  icon?: ReactNode;
  /**
   * `card` (default): section is its own card with a header row.
   * `aside`: ≥lg shows title/description in a left column (logical start) and fields on the right.
   */
  layout?: 'card' | 'aside';
  className?: string;
  children: ReactNode;
  id?: string;
};

/** Logical group of form fields (Identity, Contact, Employment …). Wrap fields in <FormGrid>. */
export function FormSection({ title, description, actions, icon, layout = 'card', className, children, id }: FormSectionProps) {
  if (layout === 'aside') {
    return (
      <section id={id} data-slot="form-section" className={cn('grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-8', className)}>
        <div className="min-w-0">
          <h2 className="text-card-title text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-meta text-muted-foreground">{description}</p> : null}
          {actions ? <div className="mt-3 flex gap-2">{actions}</div> : null}
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card">{children}</div>
      </section>
    );
  }
  return (
    <section id={id} data-slot="form-section" className={cn('rounded-lg border border-border bg-card shadow-card', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon ? (
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-card-title text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-meta text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export type FormGridProps = {
  /** Columns at ≥md (1 on mobile). Default 2. */
  columns?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
};

/** Responsive field grid: 1 column on mobile, 2 (or 3) from md. */
export function FormGrid({ columns = 2, className, children }: FormGridProps) {
  return (
    <div
      data-slot="form-grid"
      className={cn(
        'grid grid-cols-1 gap-x-5 gap-y-4',
        columns === 2 && 'md:grid-cols-2',
        columns === 3 && 'md:grid-cols-2 xl:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Makes a child span the full FormGrid width (textareas, address, notes). */
export function FormFullRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('col-span-full min-w-0', className)}>{children}</div>;
}

/** Width-controlled container for forms (max ~1040px). */
export function FormContainer({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto flex w-full max-w-form flex-col gap-5', className)}>{children}</div>;
}
