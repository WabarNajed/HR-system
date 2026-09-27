'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { InboxIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import type { RequestListRow } from '../types';
import { RequestSlaBadge, StepLabel, TypeCell, TypeIcon } from './request-bits';

/** Compact client-side table of one employee's requests (profile tab). */
export function EmployeeRequestsTable({ rows }: { rows: RequestListRow[] }) {
  const t = useTranslations('requests');
  const ts = useTranslations('statuses.request');
  const fmt = useDateFormat();
  const locale = useLocale() as Locale;

  const columns = useMemo<ColumnDef<RequestListRow>[]>(
    () => [
      {
        id: 'request_number',
        accessorKey: 'request_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.number')} />,
        meta: { label: t('columns.number'), width: '10rem' },
        cell: ({ row }) => <bdi className="font-semibold text-foreground numeric">{row.original.request_number ?? '—'}</bdi>,
      },
      { id: 'type', header: t('columns.type'), enableSorting: false, meta: { label: t('columns.type') }, cell: ({ row }) => <TypeCell row={row.original} /> },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.created')} />,
        meta: { label: t('columns.created') },
        cell: ({ row }) => <span className="text-muted-foreground numeric">{fmt.date(row.original.created_at)}</span>,
      },
      { id: 'step', header: t('columns.step'), enableSorting: false, meta: { label: t('columns.step'), defaultHidden: true }, cell: ({ row }) => <StepLabel row={row.original} /> },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.status')} />,
        meta: { label: t('columns.status') },
        cell: ({ row }) => <StatusBadge domain="request" status={row.original.status} />,
      },
      { id: 'sla', header: t('columns.sla'), enableSorting: false, meta: { label: t('columns.sla') }, cell: ({ row }) => <RequestSlaBadge row={row.original} /> },
    ],
    [t, fmt],
  );

  const statuses = Array.from(new Set(rows.map((r) => r.status)));
  const typeOptions = Array.from(new Map(rows.filter((r) => r.type).map((r) => [r.type!.key, r.type!])).values());

  return (
    <DataTable
      tableId="employee-requests"
      mode="client"
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/requests/${r.id}`}
      density="compact"
      maxHeight="28rem"
      defaultPageSize={10}
      className="p-3"
      searchText={(r) => [r.request_number, r.title, r.type?.name_ar, r.type?.name_en].filter(Boolean).join(' ')}
      filters={[
        { key: 'status', title: t('filters.status'), options: statuses.map((s) => ({ value: s, label: ts(s) })) },
        { key: 'type', title: t('filters.type'), options: typeOptions.map((x) => ({ value: x.key, label: localized(x, 'name', locale) })), accessor: (r) => r.type?.key },
      ]}
      emptyState={{ icon: InboxIcon, title: t('employeeTab.emptyTitle'), description: t('employeeTab.emptyDescription') }}
      renderMobileCard={(row) => (
        <div className="flex items-start gap-3">
          <TypeIcon icon={row.type?.icon} color={row.type?.color} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium text-foreground">{row.type ? localized(row.type, 'name', locale) : t('unknownType')}</p>
              <StatusBadge domain="request" status={row.status} size="sm" />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground numeric">
              <bdi>{row.request_number ?? '—'}</bdi> · {fmt.date(row.created_at)}
            </p>
          </div>
        </div>
      )}
    />
  );
}
