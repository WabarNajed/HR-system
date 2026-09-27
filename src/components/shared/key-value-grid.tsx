import type { ReactNode } from 'react';
import { cn, isBlank } from '@/lib/utils';

export type KeyValueItem = {
  label: ReactNode;
  value: ReactNode;
  /** Span multiple columns (e.g. address). */
  span?: 1 | 2 | 'full';
  /** Render the value LTR-isolated (IBAN, phone, email, IDs). */
  ltr?: boolean;
  /** Small helper line under the value (e.g. Hijri date). */
  hint?: ReactNode;
  /** Hide the row entirely (permission-driven fields). */
  hidden?: boolean;
};

export type KeyValueGridProps = {
  items: KeyValueItem[];
  /** Columns at the largest breakpoint (1 on mobile). Default 3. */
  columns?: 1 | 2 | 3 | 4;
  /** Placeholder for empty values (default "—"). */
  empty?: ReactNode;
  className?: string;
};

const colsClass = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
} as const;

/** Read-only label/value pairs for profile and detail pages; "—" for empty values. */
export function KeyValueGrid({ items, columns = 3, empty = '—', className }: KeyValueGridProps) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', colsClass[columns], className)} data-slot="key-value-grid">
      {items
        .filter((item) => !item.hidden)
        .map((item, index) => {
          const blank = isBlank(item.value);
          return (
            <div
              key={index}
              className={cn('min-w-0', item.span === 2 && 'sm:col-span-2', item.span === 'full' && 'col-span-full')}
            >
              <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
              <dd className={cn('mt-1 text-sm break-words text-foreground', blank && 'text-faint-foreground')}>
                {blank ? empty : item.ltr ? <bdi dir="ltr" className="numeric">{item.value}</bdi> : item.value}
                {item.hint ? <div className="mt-0.5 text-xs text-muted-foreground">{item.hint}</div> : null}
              </dd>
            </div>
          );
        })}
    </dl>
  );
}
