'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { FilterXIcon, TableIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useCallback, useMemo, type ReactNode } from 'react';
import { DataTable, DataTableColumnHeader, type SortState } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { SlaBadge } from '@/components/shared/sla-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import type { Locale } from '@/lib/i18n/config';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { columnField, type ReportColumn, type ReportDefinition } from '../definitions';
import { formatValue, pickLocalized, tOr, useReportT, type LooseT } from './format';

type Row = Record<string, unknown>;

const BUCKET_VARIANT: Record<string, BadgeVariant> = {
  expired: 'danger',
  within30: 'warning',
  within60: 'secondary',
  within90: 'info',
  valid: 'success',
  missing: 'neutral',
};

const NUMERIC_KINDS = new Set<ReportColumn['kind']>(['integer', 'decimal', 'days', 'percent', 'daysLeft']);

function Muted({ children }: { children?: ReactNode }) {
  return <span className="text-faint-foreground">{children ?? '—'}</span>;
}

function useCellRenderer() {
  const t = useReportT();
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  return useMemo(
    () =>
      function renderCell(col: ReportColumn, row: Row): ReactNode {
        const field = columnField(col);
        const raw = row[field];
        switch (col.kind) {
          case 'employee': {
            const id = (row[col.linkField ?? 'employee_id'] as string | undefined) ?? undefined;
            return (
              <EmployeeCell
                size="sm"
                employee={{
                  id,
                  name_ar: row.name_ar as string | null,
                  name_en: row.name_en as string | null,
                }}
                subtitle={row.employee_number ? <span className="numeric">{String(row.employee_number)}</span> : undefined}
                href={id ? `/employees/${id}` : undefined}
              />
            );
          }
          case 'user': {
            const name = pickLocalized(row, 'actor_name', locale) || (row.actor_email as string | null);
            if (!row.actor_id) return <span className="font-medium text-muted-foreground">{t('reports.view.system')}</span>;
            return (
              <EmployeeCell
                size="sm"
                employee={{
                  id: row.actor_id as string,
                  name_ar: name,
                  name_en: name,
                }}
                subtitle={row.actor_email && row.actor_email !== name ? String(row.actor_email) : undefined}
              />
            );
          }
          case 'localized': {
            const value = pickLocalized(row, field, locale);
            if (value) return <span className="block max-w-72 truncate">{value}</span>;
            return col.emptyKey ? <span className="text-muted-foreground">{t(col.emptyKey)}</span> : <Muted />;
          }
          case 'code':
            return raw ? <span className="font-medium numeric ltr-isolate">{String(raw)}</span> : <Muted />;
          case 'request': {
            const id = row[col.linkField ?? 'id'] as string | undefined;
            if (!raw) return <Muted />;
            return id ? (
              <Link
                href={`/requests/${id}`}
                className="font-medium text-primary numeric hover:underline hover:underline-offset-4"
                onClick={(e) => e.stopPropagation()}
              >
                {String(raw)}
              </Link>
            ) : (
              <span className="font-medium numeric">{String(raw)}</span>
            );
          }
          case 'integer':
            return raw === null || raw === undefined ? <Muted /> : formatValue(raw, 'integer', locale, t);
          case 'decimal':
            return raw === null || raw === undefined ? <Muted /> : formatValue(raw, 'decimal', locale, t);
          case 'days':
            return raw === null || raw === undefined ? <Muted /> : formatValue(raw, 'decimal', locale, t);
          case 'percent':
            return raw === null || raw === undefined ? <Muted /> : formatValue(raw, 'percent', locale, t);
          case 'date':
            return raw ? <span className="whitespace-nowrap">{fmt.date(raw as string)}</span> : <Muted />;
          case 'datetime':
            return raw ? <span className="whitespace-nowrap">{fmt.dateTime(raw as string)}</span> : <Muted />;
          case 'month':
            return raw ? (
              <span className="font-medium whitespace-nowrap">{fmt.monthYear(raw as string, { month: 'long' })}</span>
            ) : (
              <Muted />
            );
          case 'hijri': {
            // Computed from the Gregorian date (consistent format); the imported text is the fallback.
          const text = (col.dateField && row[col.dateField] ? fmt.hijri(row[col.dateField] as string) : null) || (raw as string | null);
            return text ? <span className="whitespace-nowrap">{text}</span> : <Muted />;
          }
          case 'status':
            return raw ? <StatusBadge domain={col.statusDomain!} status={String(raw)} size="sm" /> : <Muted />;
          case 'enum':
            return raw ? tOr(t, `enums.${col.enumKey}.${raw}`, raw) : <Muted />;
          case 'category':
            return raw ? tOr(t, `reports.categories.${raw}`, raw) : <Muted />;
          case 'bucket':
            return raw ? (
              <Badge variant={BUCKET_VARIANT[String(raw)] ?? 'neutral'} size="sm" dot>
                {tOr(t, `reports.buckets.${raw}`, raw)}
              </Badge>
            ) : (
              <Muted />
            );
          case 'sla': {
            if (!raw) return <Muted />;
            if (raw === 'met' || raw === 'missed') {
              return (
                <Badge variant={raw === 'met' ? 'success' : 'danger'} size="sm" dot>
                  {t(`reports.sla.${raw}`)}
                </Badge>
              );
            }
            return <SlaBadge state={raw as 'on_track' | 'due_soon' | 'overdue'} size="sm" />;
          }
          case 'daysLeft': {
            if (raw === null || raw === undefined) return <Muted />;
            const n = Number(raw);
            return (
              <span
                className={cn(
                  'whitespace-nowrap font-medium numeric',
                  n < 0 ? 'text-danger' : n <= 30 ? 'text-warning' : 'text-foreground',
                )}
              >
                {n < 0 ? t('reports.view.daysAgo', { count: Math.abs(n) }) : t('reports.view.daysLeft', { count: n })}
              </span>
            );
          }
          default:
            return raw === null || raw === undefined || raw === '' ? (
              <Muted />
            ) : (
              <span className="block max-w-80 truncate">{String(raw)}</span>
            );
        }
      },
    [t, locale, fmt],
  );
}

/** Text used by client-mode search for a row. */
function rowSearchText(def: ReportDefinition, row: Row, t: LooseT): string {
  return def.columns
    .map((col) => {
      const field = columnField(col);
      if (col.kind === 'employee') return `${row.name_ar ?? ''} ${row.name_en ?? ''} ${row.employee_number ?? ''}`;
      if (col.kind === 'localized') return `${row[`${field}_ar`] ?? ''} ${row[`${field}_en`] ?? ''}`;
      if (col.kind === 'user') return `${row.actor_name_ar ?? ''} ${row.actor_name_en ?? ''} ${row.actor_email ?? ''}`;
      if (col.kind === 'category') return tOr(t, `reports.categories.${row[field]}`, row[field]);
      const v = row[field];
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    })
    .join(' ');
}

/** Client-mode sort value (localized columns compare the visible label). */
function sortValue(col: ReportColumn, row: Row, locale: Locale): string | number {
  const field = columnField(col);
  if (col.kind === 'localized') return (pickLocalized(row, field, locale) ?? '').toLocaleLowerCase();
  if (col.kind === 'employee') return String((locale === 'ar' ? row.name_ar : row.name_en) ?? row.name_ar ?? '').toLocaleLowerCase();
  if (col.kind === 'user') return String(pickLocalized(row, 'actor_name', locale) ?? row.actor_email ?? '').toLocaleLowerCase();
  const v = row[field];
  if (v === null || v === undefined) return NUMERIC_KINDS.has(col.kind) ? Number.NEGATIVE_INFINITY : '';
  return NUMERIC_KINDS.has(col.kind) ? Number(v) : String(v);
}

export type ReportTableProps = {
  def: ReportDefinition;
  rows: Row[];
  total: number;
  filtered: boolean;
};

export function ReportTable({ def, rows, total, filtered }: ReportTableProps) {
  const t = useReportT();
  const locale = useLocale() as Locale;
  const render = useCellRenderer();
  const serverMode = def.table === 'paged';

  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      def.columns.map((col, index) => {
        const numeric = NUMERIC_KINDS.has(col.kind);
        const label = t(col.labelKey);
        return {
          id: col.id,
          accessorFn: (row: Row) => sortValue(col, row, locale),
          header: ({ column }) => <DataTableColumnHeader column={column} title={label} className="max-w-none! overflow-visible!" />,
          cell: ({ row }) => render(col, row.original),
          enableSorting: col.sortable !== false,
          sortUndefined: 'last',
          enableHiding: index > 0,
          meta: {
            label,
            align: numeric ? 'end' : 'start',
            defaultHidden: col.defaultHidden,
            cellClassName: numeric ? 'numeric' : undefined,
          },
        } satisfies ColumnDef<Row>;
      }),
    [def, t, locale, render],
  );

  // Stable identity: DataTable recomputes (and resets selection) whenever `searchText` changes.
  const searchText = useCallback((row: Row) => rowSearchText(def, row, t), [def, t]);
  const defaultSort: SortState = useMemo(() => ({ id: def.defaultSort.id, desc: def.defaultSort.desc }), [def.defaultSort]);
  const firstCol = def.columns[0]!;

  return (
    <DataTable<Row>
      tableId={`report:${def.key}`}
      mode={serverMode ? 'server' : 'client'}
      columns={columns}
      data={rows}
      total={total}
      getRowId={(row, i) => String(row.__rowId ?? i)}
      defaultSort={defaultSort}
      searchPlaceholder={t('reports.view.searchPlaceholder')}
      searchText={serverMode ? undefined : searchText}
      density="compact"
      maxHeight="none"
      pageSizes={[10, 25, 50, 100]}
      defaultPageSize={serverMode ? 25 : 50}
      emptyState={
        filtered
          ? {
              icon: FilterXIcon,
              title: t('reports.view.emptyTitle'),
              description: t('reports.view.emptyDescription'),
            }
          : {
              icon: TableIcon,
              title: t('reports.view.noRecordsTitle'),
              description: t('reports.view.noRecordsDescription'),
            }
      }
      renderMobileCard={(row) => <MobileRow def={def} row={row} render={render} firstCol={firstCol} />}
    />
  );
}

function MobileRow({
  def,
  row,
  render,
  firstCol,
}: {
  def: ReportDefinition;
  row: Row;
  render: (col: ReportColumn, row: Row) => ReactNode;
  firstCol: ReportColumn;
}) {
  const t = useReportT();
  const rest = def.columns
    .slice(1)
    .filter((c) => !c.defaultHidden)
    .slice(0, 4);
  return (
    <div className="flex flex-col gap-2">
      <div className="min-w-0">{render(firstCol, row)}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-meta">
        {rest.map((col) => (
          <div key={col.id} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{t(col.labelKey)}</dt>
            <dd className="min-w-0 truncate font-medium">{render(col, row)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
