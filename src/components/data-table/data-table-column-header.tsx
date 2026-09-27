'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: ReactNode;
  className?: string;
};

/**
 * Sortable header: click cycles asc → desc → none. The column id is the sort key sent to the
 * server (`?sort=<id>&dir=`), so keep ids aligned with the page's `allowedSorts`.
 */
export function DataTableColumnHeader<TData, TValue>({ column, title, className }: DataTableColumnHeaderProps<TData, TValue>) {
  const t = useTranslations('common.a11y');
  const align = column.columnDef.meta?.align;
  if (!column.getCanSort()) {
    return <span className={cn('block truncate', className)}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ChevronsUpDownIcon;
  return (
    <button
      type="button"
      onClick={() => {
        if (!sorted) column.toggleSorting(false);
        else if (sorted === 'asc') column.toggleSorting(true);
        else column.clearSorting();
      }}
      className={cn(
        '-mx-1.5 inline-flex h-7 max-w-full items-center gap-1 rounded-sm px-1.5 font-semibold transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
        sorted && 'text-foreground',
        align === 'end' && 'flex-row-reverse',
        className,
      )}
    >
      <span className="truncate">{title}</span>
      <Icon className={cn('size-3.5 shrink-0', !sorted && 'opacity-45')} aria-hidden />
      {sorted ? <span className="sr-only">{sorted === 'asc' ? t('sortedAscending') : t('sortedDescending')}</span> : null}
    </button>
  );
}
