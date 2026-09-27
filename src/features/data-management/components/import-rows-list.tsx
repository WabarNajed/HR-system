'use client';

import { ChevronLeftIcon, ChevronRightIcon, RowsIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { SearchInput } from '@/components/shared/search-input';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { listImportRowsAction } from '../actions';
import { enumLabel, getField } from '../lib/schemas';
import type { ImportType, JsonCell, RowAction } from '../lib/types';
import type { ImportRowView, RowFilter } from '../types';
import { IssueList } from './issue-list';
import { useFieldLabel, useLooseT } from './use-dm';

const PAGE_SIZE = 25;

export type RowTab = { value: RowFilter; count?: number | null };

const ACTION_VARIANT: Record<RowAction, 'success' | 'info' | 'neutral'> = { create: 'success', update: 'info', skip: 'neutral' };

export function ActionBadge({ action }: { action: RowAction }) {
  const t = useTranslations('dataManagement.wizard.review.actions');
  return (
    <Badge variant={ACTION_VARIANT[action]} size="sm">
      {t(action)}
    </Badge>
  );
}

function useValueFormatter(type: ImportType) {
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const tc = useTranslations('common');
  return useCallback(
    (key: string, value: unknown): string => {
      if (value === null || value === undefined || value === '') return '';
      const field = getField(type, key);
      if (typeof value === 'boolean') return value ? tc('yes') : tc('no');
      if (field?.type === 'enum' && field.enumKind && typeof value === 'string') return enumLabel(field.enumKind, value, locale);
      if (field?.type === 'gender' && typeof value === 'string') return enumGender(value, locale);
      if (field?.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return fmt.date(value);
      return String(value);
    },
    [type, locale, fmt, tc],
  );
}

function enumGender(value: string, locale: 'ar' | 'en'): string {
  const map = { male: { ar: 'ذكر', en: 'Male' }, female: { ar: 'أنثى', en: 'Female' } } as const;
  return map[value as 'male' | 'female']?.[locale] ?? value;
}

function cellString(v: JsonCell | undefined): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'boolean' ? String(v) : String(v);
}

/** Row detail: messages, file values, imported values and additional data. */
export function ImportRowSheet({ type, row, onOpenChange }: { type: ImportType; row: ImportRowView | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('dataManagement.wizard.review');
  const label = useFieldLabel(type);
  const format = useValueFormatter(type);
  const values = row ? Object.entries(row.values).filter(([, v]) => v !== null && v !== undefined && v !== '') : [];
  const raw = row ? Object.entries(row.raw) : [];
  const extra = row ? Object.entries(row.extra) : [];
  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="sm:max-w-xl">
        {row ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{t('rowDetails', { row: row.rowNumber })}</SheetTitle>
                <StatusBadge domain="importRow" status={row.status} size="sm" />
                {row.status !== 'error' ? <ActionBadge action={row.action} /> : null}
              </div>
              <SheetDescription className="truncate">{[row.title, row.subtitle].filter(Boolean).join(' · ')}</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t('columns.messages')}</h3>
                <IssueList type={type} errors={row.errors} warnings={row.warnings} emptyLabel={t('noMessages')} />
              </section>
              {values.length ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t('importedValues')}</h3>
                  <dl className="divide-y divide-border rounded-md border border-border">
                    {values.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-meta">
                        <dt className="truncate text-muted-foreground">{label(k)}</dt>
                        <dd className="min-w-0 break-words font-medium text-foreground">
                          <bdi>{format(k, v)}</bdi>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
              {extra.length ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t('additionalData')}</h3>
                  <dl className="divide-y divide-border rounded-md border border-dashed border-border-strong">
                    {extra.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-meta">
                        <dt className="truncate text-muted-foreground">
                          <bdi>{k}</bdi>
                        </dt>
                        <dd className="min-w-0 break-words text-foreground">
                          <bdi>{cellString(v)}</bdi>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t('originalValues')}</h3>
                <dl className="divide-y divide-border rounded-md border border-border bg-subtle/60">
                  {raw.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-meta">
                      <dt className="truncate text-muted-foreground">
                        <bdi>{k}</bdi>
                      </dt>
                      <dd className="min-w-0 break-words text-foreground">
                        <bdi>{cellString(v)}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Props = {
  importId: string;
  type: ImportType;
  tabs: RowTab[];
  defaultTab?: RowFilter;
  /** Change to reload (e.g. after re-validation). */
  reloadKey?: string | number;
  className?: string;
  /** Compact layout (sheets). */
  compact?: boolean;
};

/** Server-paginated list of import rows with status tabs, search and a row detail sheet. */
export function ImportRowsList({ importId, type, tabs, defaultTab = 'all', reloadKey, className, compact = false }: Props) {
  const t = useTranslations('dataManagement.wizard.review');
  const tabT = useLooseT('dataManagement.wizard.review.tabs');
  const tc = useTranslations('common');
  const [filter, setFilter] = useState<RowFilter>(defaultTab);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: ImportRowView[]; total: number } | { key: string; error: string } | null>(null);
  const [open, setOpen] = useState<ImportRowView | null>(null);
  const key = `${importId}|${filter}|${q}|${page}|${reloadKey ?? ''}|${nonce}`;

  useEffect(() => {
    let alive = true;
    listImportRowsAction({ importId, filter, q: q || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!alive) return;
        setResult(res.ok && res.data ? { key, rows: res.data.rows, total: res.data.total } : { key, error: res.ok ? 'errors.generic' : res.error });
      })
      .catch(() => {
        if (alive) setResult({ key, error: 'errors.network' });
      });
    return () => {
      alive = false;
    };
  }, [key, importId, filter, q, page]);

  const loading = result?.key !== key;
  const failed = !loading && result !== null && 'error' in result;
  const rows = result && 'rows' in result ? result.rows : null;
  const total = result && 'rows' in result ? result.total : 0;
  const load = () => setNonce((n) => n + 1);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div className={cn('flex flex-col gap-2 border-b border-border sm:flex-row sm:items-center sm:justify-between', compact ? 'px-0 pb-3' : 'px-4 py-3')}>
        <SegmentedTabs
          size="sm"
          value={filter}
          onValueChange={(v) => {
            setFilter(v as RowFilter);
            setPage(1);
          }}
          items={tabs.map((tab) => ({ value: tab.value, label: tabT(tab.value), count: tab.count ?? null }))}
          aria-label={t('columns.status')}
        />
        <SearchInput
          value={q}
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
          loading={loading && Boolean(q)}
          placeholder={t('search')}
          wrapperClassName="sm:w-64"
          className="h-8"
        />
      </div>

      {failed ? (
        <ErrorState className="m-4" variant="inline" onRetry={() => load()} />
      ) : rows === null ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={RowsIcon} title={t('emptyTab')} tone="neutral" className="min-h-40" />
      ) : (
        <>
          {/* Desktop table */}
          <div className={cn('hidden md:block', loading && 'opacity-60 transition-opacity')}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">{t('columns.row')}</TableHead>
                  <TableHead className="w-28">{t('columns.status')}</TableHead>
                  <TableHead className="w-24">{t('columns.action')}</TableHead>
                  <TableHead className="w-[26%]">{t('columns.record')}</TableHead>
                  <TableHead>{t('columns.messages')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    className="cursor-pointer align-top"
                    onClick={() => setOpen(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setOpen(row);
                    }}
                  >
                    <TableCell className="align-top text-meta text-muted-foreground numeric">{row.rowNumber}</TableCell>
                    <TableCell className="align-top">
                      <StatusBadge domain="importRow" status={row.status} size="sm" />
                    </TableCell>
                    <TableCell className="align-top">{row.status !== 'error' ? <ActionBadge action={row.action} /> : <span className="text-faint-foreground">—</span>}</TableCell>
                    <TableCell className="max-w-0 align-top whitespace-normal">
                      <div className="truncate font-medium text-foreground">
                        <bdi>{row.title || '—'}</bdi>
                      </div>
                      {row.subtitle ? (
                        <div className="truncate text-xs text-muted-foreground numeric">
                          <bdi>{row.subtitle}</bdi>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <IssueList type={type} errors={row.errors} warnings={row.warnings} max={2} emptyLabel={t('noMessages')} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile cards */}
          <ul className={cn('flex flex-col divide-y divide-border md:hidden', loading && 'opacity-60')}>
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => setOpen(row)} className="flex w-full flex-col gap-2 px-4 py-3 text-start outline-none focus-visible:bg-subtle">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground numeric">#{row.rowNumber}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      <bdi>{row.title || '—'}</bdi>
                    </span>
                    <StatusBadge domain="importRow" status={row.status} size="sm" />
                  </div>
                  <IssueList type={type} errors={row.errors} warnings={row.warnings} max={2} />
                </button>
              </li>
            ))}
          </ul>
          <div className={cn('flex items-center justify-between gap-3 border-t border-border text-meta text-muted-foreground', compact ? 'pt-3' : 'px-4 py-2.5')}>
            <span className="numeric">{tc('showingRange', { from, to, total })}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label={tc('previous')}>
                <ChevronLeftIcon className="rtl:rotate-180" />
              </Button>
              <span className="px-2 numeric">{tc('pageOf', { page, pages })}</span>
              <Button variant="outline" size="icon-sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} aria-label={tc('next')}>
                <ChevronRightIcon className="rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </>
      )}
      <ImportRowSheet type={type} row={open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
