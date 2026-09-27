'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2Icon, FileSignatureIcon, FileTextIcon, InboxIcon, PanelRightOpenIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef, type RowAction } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { SlaBadge } from '@/components/shared/sla-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { mergeSearchParams } from '@/lib/list-params';
import type { CertificateRequestRow } from '../types';
import { CERTIFICATE_TYPES } from '../variables';
import { useCertificateLabels } from './use-certificate-labels';

const STATUS_OPTIONS = ['pending_hr_review', 'approved', 'in_progress', 'completed', 'returned', 'rejected', 'cancelled'] as const;
const ISSUABLE = new Set(['pending_hr_review', 'approved', 'in_progress', 'completed']);

type Props = {
  rows: CertificateRequestRow[];
  total: number;
  hrView: boolean;
  canIssue: boolean;
  requestCertificateHref?: string | null;
};

export function CertificateRequestsTable({ rows, total, hrView, canIssue, requestCertificateHref }: Props) {
  const t = useTranslations('certificates');
  const fmt = useDateFormat();
  const labels = useCertificateLabels();
  const searchParams = useSearchParams();

  const sheetHref = (id: string) => `?${mergeSearchParams(searchParams, { request: id, page: searchParams.get('page') }).toString()}`;

  const rowActions = (row: CertificateRequestRow): RowAction<CertificateRequestRow>[] => [
    {
      label: canIssue && ISSUABLE.has(row.status) ? t('actions.issueCertificate') : t('actions.view'),
      icon: canIssue && ISSUABLE.has(row.status) ? FileSignatureIcon : PanelRightOpenIcon,
      href: sheetHref(row.id),
    },
    { label: t('actions.openRequest'), icon: FileTextIcon, href: `/requests/${row.id}` },
  ];

  const columns = useMemo<ColumnDef<CertificateRequestRow>[]>(() => {
    const cols: ColumnDef<CertificateRequestRow>[] = [
      {
        id: 'request_number',
        accessorKey: 'request_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.requestNumber')} />,
        cell: ({ row }) => (
          <Link href={`/requests/${row.original.id}`} className="font-medium text-foreground hover:text-primary hover:underline" data-no-row-click>
            <bdi dir="ltr" className="numeric">
              {row.original.request_number ?? '—'}
            </bdi>
          </Link>
        ),
        meta: { label: t('fields.requestNumber'), sticky: true, width: '10.5rem' },
      },
      {
        id: 'employee',
        header: () => t('fields.employee'),
        cell: ({ row }) =>
          row.original.employee ? (
            <EmployeeCell
              employee={row.original.employee}
              subtitle={row.original.employee.employee_number ? <bdi dir="ltr">{row.original.employee.employee_number}</bdi> : null}
              size="sm"
            />
          ) : (
            '—'
          ),
        enableSorting: false,
        meta: { label: t('fields.employee'), width: '15rem' },
      },
      {
        id: 'type',
        header: () => t('fields.type'),
        cell: ({ row }) => (
          <div className="min-w-0 leading-tight">
            <div className="truncate font-medium">{labels.type(row.original.subtype)}</div>
            {row.original.addressed_to ? <div className="mt-0.5 truncate text-meta text-muted-foreground">{row.original.addressed_to}</div> : null}
          </div>
        ),
        enableSorting: false,
        meta: { label: t('fields.type') },
      },
      {
        id: 'language',
        header: () => t('fields.language'),
        cell: ({ row }) =>
          row.original.language ? (
            <Badge variant="outline" size="sm">
              {labels.language(row.original.language)}
            </Badge>
          ) : (
            '—'
          ),
        enableSorting: false,
        meta: { label: t('fields.language') },
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.submitted')} />,
        cell: ({ row }) => <span className="numeric whitespace-nowrap">{fmt.date(row.original.submitted_at ?? row.original.created_at)}</span>,
        meta: { label: t('fields.submitted') },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.requestStatus')} />,
        cell: ({ row }) => <StatusBadge domain="request" status={row.original.status} size="sm" />,
        meta: { label: t('fields.requestStatus') },
      },
      {
        id: 'due_at',
        accessorKey: 'due_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.sla')} />,
        cell: ({ row }) => <SlaBadge state={row.original.sla} size="sm" dueLabel={row.original.due_at ? fmt.dateTime(row.original.due_at) : undefined} />,
        meta: { label: t('fields.sla') },
      },
      {
        id: 'certificate',
        header: () => t('fields.certificate'),
        cell: ({ row }) => {
          const r = row.original;
          if (r.issued_count > 0) {
            return (
              <Badge variant="success" size="sm" className="gap-1">
                <CheckCircle2Icon className="size-3.5" aria-hidden />
                {t('issuedCount', { count: r.issued_count })}
              </Badge>
            );
          }
          if (canIssue && ISSUABLE.has(r.status)) {
            return (
              <Button asChild size="sm" variant="soft" className="h-7" data-no-row-click>
                <Link href={sheetHref(r.id)} scroll={false}>
                  <FileSignatureIcon />
                  {t('actions.issue')}
                </Link>
              </Button>
            );
          }
          return <span className="text-meta text-faint-foreground">{t('notIssued')}</span>;
        },
        enableSorting: false,
        meta: { label: t('fields.certificate') },
      },
      actionsColumn(rowActions),
    ];
    return hrView ? cols : cols.filter((c) => c.id !== 'employee');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrView, canIssue, t, labels, fmt, searchParams]);

  const filters: FilterDef<CertificateRequestRow>[] = [
    { key: 'status', title: t('filters.requestStatus'), options: STATUS_OPTIONS.map((v) => ({ value: v, label: labels.requestStatus(v) })) },
    { key: 'type', title: t('filters.type'), options: CERTIFICATE_TYPES.map((v) => ({ value: v, label: labels.type(v) })) },
  ];

  return (
    <DataTable
      tableId={hrView ? 'certificates-requests' : 'certificates-requests-own'}
      columns={columns}
      data={rows}
      total={total}
      getRowId={(r) => r.id}
      rowHref={(r) => sheetHref(r.id)}
      searchPlaceholder={t('filters.searchRequests')}
      filters={filters}
      moreFilters={[{ type: 'dateRange', key: 'created', title: t('filters.submitted') }]}
      defaultSort={{ id: 'created_at', desc: true }}
      emptyState={{
        icon: InboxIcon,
        title: hrView ? t('empty.requestsTitle') : t('empty.myRequestsTitle'),
        description: hrView ? t('empty.requestsDescription') : t('empty.myRequestsDescription'),
        action: requestCertificateHref ? (
          <Button asChild size="sm">
            <Link href={requestCertificateHref}>{t('requestCertificate')}</Link>
          </Button>
        ) : undefined,
      }}
      renderMobileCard={(row) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{labels.type(row.subtype)}</div>
              <bdi dir="ltr" className="numeric mt-0.5 block text-meta text-muted-foreground">
                {row.request_number ?? '—'}
              </bdi>
            </div>
            <StatusBadge domain="request" status={row.status} size="sm" />
          </div>
          {hrView && row.employee ? <EmployeeCell employee={row.employee} size="xs" /> : null}
          <div className="flex items-center justify-between gap-2 text-meta text-muted-foreground">
            <span className="numeric">{fmt.date(row.submitted_at ?? row.created_at)}</span>
            {row.issued_count > 0 ? (
              <Badge variant="success" size="sm">
                {t('issuedCount', { count: row.issued_count })}
              </Badge>
            ) : (
              <SlaBadge state={row.sla} size="sm" />
            )}
          </div>
        </div>
      )}
    />
  );
}
