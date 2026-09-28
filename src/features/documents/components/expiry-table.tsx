'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BuildingIcon, CalendarClockIcon, CalendarX2Icon, LayersIcon, UserRoundIcon, UsersIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { BUCKETS, fileRouteUrl } from '@/lib/storage';
import { EXPIRY_BANDS, EXPIRY_KINDS, EXPIRY_SUBJECTS } from '../constants';
import type { ExpiryItemRow } from '../types';
import type { DepartmentOption } from './documents-table';
import { ExpiryBadge, useBandOptions, useExpiryItemLabel } from './labels';

type Props = {
  rows: ExpiryItemRow[];
  total: number;
  today: string;
  departments: DepartmentOption[];
  exportEnabled: boolean;
  /** HR can open employee profiles (employees.view, org scope). */
  canOpenEmployee: boolean;
};

export function employeeLink(row: Pick<ExpiryItemRow, 'employee_id' | 'kind'>): string {
  return `/employees/${row.employee_id}${row.kind === 'document' ? '?tab=documents' : ''}`;
}

export function ExpiryTable({ rows, total, today, departments, exportEnabled, canOpenEmployee }: Props) {
  const t = useTranslations('documents');
  const tr = useTranslations('enums.relationship');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const itemLabel = useExpiryItemLabel();
  const bandOptions = useBandOptions(EXPIRY_BANDS);

  const holder = useMemo(
    () => (r: ExpiryItemRow) => {
      if (r.subject !== 'dependent') return null;
      const name = localized({ name_ar: r.dependent_name_ar, name_en: r.dependent_name_en }, 'name', locale);
      const rel = r.dependent_relationship && (tr as unknown as { has: (k: string) => boolean }).has(r.dependent_relationship)
        ? tr(r.dependent_relationship as 'spouse')
        : null;
      return t('expiry.dependentLabel', { name: [name, rel ? `(${rel})` : null].filter(Boolean).join(' ') || '—' });
    },
    [locale, t, tr],
  );

  const columns = useMemo<ColumnDef<ExpiryItemRow>[]>(
    () => [
      {
        id: 'employee',
        // accessor makes the column sortable (server-side: `sort=employee`)
        accessorFn: (r) => localized({ name_ar: r.employee_name_ar, name_en: r.employee_name_en }, 'name', locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.employee')} />,
        cell: ({ row }) => {
          const r = row.original;
          const department = localized({ name_ar: r.department_name_ar, name_en: r.department_name_en }, 'name', locale);
          return (
            <EmployeeCell
              size="sm"
              employee={{
                id: r.employee_id,
                name_ar: r.employee_name_ar,
                name_en: r.employee_name_en,
                avatarUrl: r.employee_avatar_path ? fileRouteUrl(BUCKETS.employeeDocuments, r.employee_avatar_path) : null,
              }}
              subtitle={
                <>
                  {r.employee_number ? <bdi className="numeric">{r.employee_number}</bdi> : null}
                  {r.employee_number && department ? ' · ' : null}
                  {department}
                </>
              }
            />
          );
        },
        enableHiding: false,
        meta: { label: t('fields.employee'), width: '16rem' },
      },
      {
        id: 'kind',
        accessorKey: 'kind',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.item')} />,
        cell: ({ row }) => {
          const r = row.original;
          const sub = [holder(r), r.reference].filter(Boolean).join(' · ');
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-secondary-soft-foreground">
                {r.subject === 'dependent' ? <UsersIcon className="size-4" aria-hidden /> : <CalendarClockIcon className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{itemLabel(r)}</div>
                {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
              </div>
            </div>
          );
        },
        enableHiding: false,
        meta: { label: t('fields.item'), width: '15rem' },
      },
      {
        id: 'reference',
        accessorKey: 'reference',
        header: () => t('fields.reference'),
        cell: ({ row }) =>
          row.original.reference ? <bdi className="numeric text-muted-foreground">{row.original.reference}</bdi> : <span className="text-faint-foreground">—</span>,
        enableSorting: false,
        meta: { label: t('fields.reference'), defaultHidden: true },
      },
      {
        id: 'expiry_date',
        accessorKey: 'expiry_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.expiryDate')} />,
        cell: ({ row }) => {
          const r = row.original;
          if (!r.expiry_date) return null;
          return (
            <div className="flex flex-col">
              <span className="numeric">{fmt.date(r.expiry_date)}</span>
              {r.kind === 'iqama' ? <span className="text-xs text-muted-foreground">{fmt.hijri(r.expiry_date)}</span> : null}
            </div>
          );
        },
        meta: { label: t('fields.expiryDate'), width: '10rem' },
      },
      {
        id: 'remaining',
        header: () => t('fields.remaining'),
        cell: ({ row }) => <ExpiryBadge date={row.original.expiry_date} today={today} />,
        enableSorting: false,
        meta: { label: t('fields.remaining'), width: '10rem' },
      },
      actionsColumn<ExpiryItemRow>((r) => [
        {
          label: t('actions.openProfile'),
          icon: UserRoundIcon,
          href: employeeLink(r),
          hidden: !canOpenEmployee,
        },
      ]),
    ],
    [t, locale, fmt, itemLabel, holder, today, canOpenEmployee],
  );

  const filters = useMemo<FilterDef<ExpiryItemRow>[]>(
    () => [
      {
        key: 'kind',
        title: t('filters.kind'),
        icon: LayersIcon,
        options: EXPIRY_KINDS.map((k) => ({ value: k, label: t(`expiry.kinds.${k}`) })),
      },
      { key: 'bucket', title: t('filters.bucket'), icon: CalendarX2Icon, options: bandOptions },
      {
        key: 'subject',
        title: t('filters.subject'),
        icon: UsersIcon,
        options: EXPIRY_SUBJECTS.map((s) => ({ value: s, label: t(`expiry.subjects.${s}`) })),
      },
    ],
    [t, bandOptions],
  );

  const moreFilters = useMemo<FilterDef<ExpiryItemRow>[]>(
    () => [
      {
        key: 'department',
        title: t('filters.department'),
        icon: BuildingIcon,
        options: departments.map((d) => ({ value: d.id, label: localized(d, 'name', locale) })),
      },
    ],
    [departments, locale, t],
  );

  return (
    <DataTable<ExpiryItemRow>
      tableId="documents-expiry"
      mode="server"
      columns={columns}
      data={rows}
      total={total}
      getRowId={(r) => r.item_key ?? ''}
      rowHref={canOpenEmployee ? (r) => employeeLink(r) : undefined}
      filters={filters}
      moreFilters={departments.length ? moreFilters : undefined}
      searchPlaceholder={t('placeholders.searchExpiry')}
      exportDataset={exportEnabled ? 'expiries' : undefined}
      defaultSort={{ id: 'expiry_date', desc: false }}
      emptyState={{ icon: CalendarClockIcon, title: t('empty.expiryTitle'), description: t('empty.expiryDescription') }}
      renderMobileCard={(r) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{itemLabel(r)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[localized({ name_ar: r.employee_name_ar, name_en: r.employee_name_en }, 'name', locale), r.employee_number].filter(Boolean).join(' · ')}
              </div>
              {holder(r) ? <div className="truncate text-xs text-muted-foreground">{holder(r)}</div> : null}
            </div>
            <ExpiryBadge date={r.expiry_date} today={today} />
          </div>
          <div className="text-xs text-muted-foreground numeric">
            {t('fields.expiryDate')}: {r.expiry_date ? fmt.date(r.expiry_date) : '—'}
          </div>
        </div>
      )}
    />
  );
}

/** Compact list of expiry items (employee self-service & profile tab). */
export function ExpiryList({ items, today, emptyText }: { items: ExpiryItemRow[]; today: string; emptyText: string }) {
  const t = useTranslations('documents');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const itemLabel = useExpiryItemLabel();
  if (!items.length) return <p className="px-1 py-2 text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const dependent =
          item.subject === 'dependent' ? localized({ name_ar: item.dependent_name_ar, name_en: item.dependent_name_en }, 'name', locale) : null;
        return (
          <li key={item.item_key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{itemLabel(item)}</div>
              <div className="truncate text-xs text-muted-foreground">
                <span className="numeric">{item.expiry_date ? fmt.date(item.expiry_date) : '—'}</span>
                {dependent ? ` · ${t('expiry.dependentLabel', { name: dependent })}` : null}
              </div>
            </div>
            <ExpiryBadge date={item.expiry_date} today={today} className="shrink-0" />
          </li>
        );
      })}
    </ul>
  );
}

