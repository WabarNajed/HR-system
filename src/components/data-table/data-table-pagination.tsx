'use client';

import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGE_SIZES } from '@/lib/list-params';
import { cn } from '@/lib/utils';

export type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizes?: readonly number[];
  disabled?: boolean;
  className?: string;
};

/** Footer: rows-per-page · "x–y of z" · first/prev/page/next/last (icons mirror in RTL). */
export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = PAGE_SIZES,
  disabled,
  className,
}: DataTablePaginationProps) {
  const t = useTranslations('common.pagination');
  const format = useFormatter();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const n = (v: number) => format.number(v, 'integer');

  return (
    <div
      className={cn('flex flex-col-reverse items-center justify-between gap-3 px-4 py-2.5 sm:flex-row', className)}
      data-slot="data-table-pagination"
    >
      <div className="flex items-center gap-4 text-meta text-muted-foreground">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="whitespace-nowrap">{t('rowsPerPage')}</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))} disabled={disabled}>
            <SelectTrigger size="sm" className="h-8 w-[4.5rem] numeric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top" align="start">
              {pageSizes.map((s) => (
                <SelectItem key={s} value={String(s)} className="numeric">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="whitespace-nowrap numeric" aria-live="polite">
          {t('showingRange', { from: n(from), to: n(to), total: n(total) })}
        </span>
      </div>

      <nav aria-label={t('label')} className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('firstPage')}
          disabled={disabled || current <= 1}
          onClick={() => onPageChange(1)}
          className="hidden sm:inline-flex"
        >
          <ChevronsLeftIcon className="rtl:rotate-180" />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label={t('previousPage')} disabled={disabled || current <= 1} onClick={() => onPageChange(current - 1)}>
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <span className="min-w-24 px-2 text-center text-meta font-medium text-foreground numeric">
          {t('pageOf', { page: n(current), pages: n(pages) })}
        </span>
        <Button variant="outline" size="icon-sm" aria-label={t('nextPage')} disabled={disabled || current >= pages} onClick={() => onPageChange(current + 1)}>
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('lastPage')}
          disabled={disabled || current >= pages}
          onClick={() => onPageChange(pages)}
          className="hidden sm:inline-flex"
        >
          <ChevronsRightIcon className="rtl:rotate-180" />
        </Button>
      </nav>
    </div>
  );
}
