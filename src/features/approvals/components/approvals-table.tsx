'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCheckIcon, CheckIcon, Undo2Icon, XIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { DataTable, DataTableColumnHeader, type FilterDef } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { DecisionDialog } from '@/features/requests/components/decision-dialog';
import { RequestSlaBadge, StepLabel, TypeCell, TypeIcon } from '@/features/requests/components/request-bits';
import { rowCapabilities } from '@/features/requests/capabilities';
import { SLA_STATES } from '@/features/requests/constants';
import type { RequestActionKind } from '@/features/requests/schemas';
import type { ApprovalDecisionRow, RequestAccess, RequestListRow } from '@/features/requests/types';
import { formatRelative } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';

export type ApprovalsTab = 'pending' | 'approved' | 'rejected';

export type ApprovalFilterOptions = {
  types: { key: string; name_ar: string; name_en: string }[];
  departments: { id: string; name_ar: string | null; name_en: string | null }[];
  employees: { id: string; name_ar: string | null; name_en: string | null; hint?: string | null }[];
};

/** Approvals queue (pending decisions with quick actions) and my decision history. */
export function ApprovalsTable({
  tab,
  rows,
  total,
  access,
  options,
}: {
  tab: ApprovalsTab;
  rows: (RequestListRow | ApprovalDecisionRow)[];
  total: number;
  access: RequestAccess;
  options: ApprovalFilterOptions;
}) {
  const t = useTranslations('approvals');
  const tr = useTranslations('requests');
  const ts = useTranslations('statuses');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const [decision, setDecision] = useState<{ row: RequestListRow; action: RequestActionKind } | null>(null);

  const columns = useMemo<ColumnDef<RequestListRow | ApprovalDecisionRow>[]>(() => {
    const base: ColumnDef<RequestListRow | ApprovalDecisionRow>[] = [
      {
        id: 'request_number',
        accessorKey: 'request_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title={tr('columns.number')} />,
        enableSorting: tab === 'pending',
        meta: { label: tr('columns.number'), width: '10rem' },
        cell: ({ row }) => <bdi className="font-semibold text-foreground numeric">{row.original.request_number ?? '—'}</bdi>,
      },
      {
        id: 'employee',
        header: tr('columns.employee'),
        enableSorting: false,
        meta: { label: tr('columns.employee') },
        cell: ({ row }) =>
          row.original.employee ? (
            <EmployeeCell
              employee={{ ...row.original.employee, avatarUrl: row.original.employee.avatar_url }}
              size="sm"
              subtitle={[row.original.employee.employee_number, row.original.employee.department ? localized(row.original.employee.department, 'name', locale) : null]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : (
            <span className="text-faint-foreground">—</span>
          ),
      },
      {
        id: 'type',
        header: tr('columns.type'),
        enableSorting: false,
        meta: { label: tr('columns.type') },
        cell: ({ row }) => <TypeCell row={row.original} />,
      },
    ];
    if (tab === 'pending') {
      base.push(
        {
          id: 'step',
          header: t('columns.step'),
          enableSorting: false,
          meta: { label: t('columns.step') },
          cell: ({ row }) => <StepLabel row={{ ...row.original, approver_name: null }} />,
        },
        {
          id: 'submitted_at',
          accessorKey: 'submitted_at',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.submitted')} />,
          meta: { label: t('columns.submitted') },
          cell: ({ row }) =>
            row.original.submitted_at ? (
              <SimpleTooltip content={fmt.dateTime(row.original.submitted_at)}>
                <span className="text-muted-foreground numeric" suppressHydrationWarning>
                  {formatRelative(row.original.submitted_at, locale)}
                </span>
              </SimpleTooltip>
            ) : (
              '—'
            ),
        },
        {
          id: 'due_at',
          accessorKey: 'due_at',
          header: ({ column }) => <DataTableColumnHeader column={column} title={tr('columns.sla')} />,
          meta: { label: tr('columns.sla') },
          cell: ({ row }) => <RequestSlaBadge row={row.original} />,
        },
        {
          id: 'quick',
          header: () => <span className="sr-only">{t('columns.actions')}</span>,
          enableSorting: false,
          enableHiding: false,
          meta: { align: 'end', width: '9rem' },
          cell: ({ row }) => {
            const caps = rowCapabilities(row.original, access);
            return (
              <div className="flex items-center justify-end gap-1" data-no-row-click>
                <SimpleTooltip content={caps.canApprove ? t('quick.approve') : t('quick.notYourStep')}>
                  <span className="inline-flex">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-success hover:bg-success-soft hover:text-success"
                      aria-label={t('quick.approve')}
                      disabled={!caps.canApprove}
                      onClick={() => setDecision({ row: row.original, action: 'approve' })}
                    >
                      <CheckIcon />
                    </Button>
                  </span>
                </SimpleTooltip>
                <SimpleTooltip content={caps.canReturn ? t('quick.return') : caps.canApprove ? t('quick.returnDisabled') : t('quick.notYourStep')}>
                  <span className="inline-flex">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-warning hover:bg-warning-soft hover:text-warning"
                      aria-label={t('quick.return')}
                      disabled={!caps.canReturn}
                      onClick={() => setDecision({ row: row.original, action: 'return' })}
                    >
                      <Undo2Icon />
                    </Button>
                  </span>
                </SimpleTooltip>
                <SimpleTooltip content={caps.canReject ? t('quick.reject') : t('quick.notYourStep')}>
                  <span className="inline-flex">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-soft hover:text-danger"
                      aria-label={t('quick.reject')}
                      disabled={!caps.canReject}
                      onClick={() => setDecision({ row: row.original, action: 'reject' })}
                    >
                      <XIcon />
                    </Button>
                  </span>
                </SimpleTooltip>
              </div>
            );
          },
        },
      );
    } else {
      base.push(
        {
          id: 'decision',
          header: t('columns.decision'),
          enableSorting: false,
          meta: { label: t('columns.decision') },
          cell: ({ row }) => <StatusBadge domain="approval" status={(row.original as ApprovalDecisionRow).decision} />,
        },
        {
          id: 'comment',
          header: t('columns.comment'),
          enableSorting: false,
          meta: { label: t('columns.comment'), cellClassName: 'max-w-72' },
          cell: ({ row }) => {
            const c = (row.original as ApprovalDecisionRow).decision_comment;
            return c ? (
              <SimpleTooltip content={<span className="block max-w-80 whitespace-pre-line">{c}</span>}>
                <span dir="auto" className="block truncate text-start text-meta text-muted-foreground">
                  {c}
                </span>
              </SimpleTooltip>
            ) : (
              <span className="text-faint-foreground">—</span>
            );
          },
        },
        {
          id: 'decided_at',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.decidedAt')} />,
          accessorFn: (r) => (r as ApprovalDecisionRow).decided_at,
          meta: { label: t('columns.decidedAt') },
          cell: ({ row }) => {
            const d = (row.original as ApprovalDecisionRow).decided_at;
            return d ? <span className="text-muted-foreground numeric">{fmt.dateTime(d)}</span> : '—';
          },
        },
        {
          id: 'status',
          header: t('columns.currentStatus'),
          enableSorting: false,
          meta: { label: t('columns.currentStatus') },
          cell: ({ row }) => <StatusBadge domain="request" status={row.original.status} />,
        },
      );
    }
    return base;
  }, [tab, t, tr, fmt, locale, access]);

  const filters: FilterDef<RequestListRow | ApprovalDecisionRow>[] = [
    { key: 'type', title: tr('filters.type'), options: options.types.map((x) => ({ value: x.key, label: localized(x, 'name', locale) })) },
  ];
  if (options.employees.length) {
    filters.push({
      key: 'employee',
      title: tr('filters.employee'),
      options: options.employees.map((e) => ({ value: e.id, label: [employeeDisplayName(e, locale), e.hint].filter(Boolean).join(' · ') })),
    });
  }
  if (tab === 'pending') filters.push({ key: 'sla', title: tr('filters.sla'), multiple: false, options: SLA_STATES.map((s) => ({ value: s, label: ts(`sla.${s}`) })) });
  const moreFilters: FilterDef<RequestListRow | ApprovalDecisionRow>[] = options.departments.length
    ? [{ key: 'department', title: tr('filters.department'), options: options.departments.map((d) => ({ value: d.id, label: localized(d, 'name', locale) })) }]
    : [];

  return (
    <>
      <DataTable
        tableId={`approvals-${tab}`}
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => ('decided_at' in r ? `${r.id}-${r.decided_at}` : r.id)}
        rowHref={(r) => `/requests/${r.id}`}
        filters={filters}
        moreFilters={moreFilters}
        searchPlaceholder={tr('filters.searchPlaceholder')}
        defaultSort={tab === 'pending' ? { id: 'due_at', desc: false } : null}
        emptyState={{ icon: CheckCheckIcon, title: t(`empty.${tab}.title`), description: t(`empty.${tab}.description`) }}
        renderMobileCard={(row) => <MobileCard row={row} tab={tab} />}
      />
      <DecisionDialog
        action={decision?.action ?? null}
        target={
          decision
            ? {
                id: decision.row.id,
                number: decision.row.request_number,
                summary: [decision.row.type ? localized(decision.row.type, 'name', locale) : null, decision.row.employee ? employeeDisplayName(decision.row.employee, locale) : null]
                  .filter(Boolean)
                  .join(' · '),
              }
            : null
        }
        open={Boolean(decision)}
        onOpenChange={(o) => !o && setDecision(null)}
      />
    </>
  );
}

function MobileCard({ row, tab }: { row: RequestListRow | ApprovalDecisionRow; tab: ApprovalsTab }) {
  const locale = useLocale() as Locale;
  const tr = useTranslations('requests');
  const fmt = useDateFormat();
  const decided = tab !== 'pending' ? (row as ApprovalDecisionRow) : null;
  return (
    <div className="flex items-start gap-3">
      <TypeIcon icon={row.type?.icon} color={row.type?.color} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{row.employee ? employeeDisplayName(row.employee, locale) : '—'}</p>
          {decided ? <StatusBadge domain="approval" status={decided.decision} size="sm" /> : <RequestSlaBadge row={row} />}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          <bdi className="numeric">{row.request_number ?? '—'}</bdi> · {row.type ? localized(row.type, 'name', locale) : tr('unknownType')}
        </p>
        <p className="text-xs text-faint-foreground numeric" suppressHydrationWarning>
          {decided?.decided_at ? fmt.dateTime(decided.decided_at) : row.submitted_at ? formatRelative(row.submitted_at, locale) : null}
        </p>
      </div>
    </div>
  );
}
