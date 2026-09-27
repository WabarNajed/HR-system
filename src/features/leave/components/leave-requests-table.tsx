'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BuildingIcon, CalendarPlusIcon, CalendarRangeIcon, CircleDotIcon, EyeIcon, TagIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { actionsColumn, DataTable, type FilterDef } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { formatDays } from '@/lib/format';
import type { LeaveRequestListRow, LeaveScope, Option } from '../types';
import { LeaveTypeLabel } from './leave-type-dot';
import { SortHeader } from './sort-header';
import { UrlSegmented } from './url-controls';

const STATUS_OPTIONS = [
  'pending_manager_approval',
  'pending_hr_review',
  'returned',
  'approved',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
] as const;

export type LeaveRequestsTableProps = {
  rows: LeaveRequestListRow[];
  total: number;
  typeOptions: (Option & { color: string })[];
  departmentOptions: Option[];
  scopes: LeaveScope[];
  defaultScope: LeaveScope;
  scope: LeaveScope;
  canExport: boolean;
  canRequest: boolean;
  /** Active `?employee=` filter (from the employee profile) — shown as a removable chip. */
  employeeOption?: Option | null;
};

export function LeaveRequestsTable({
  rows,
  total,
  typeOptions,
  departmentOptions,
  scopes,
  defaultScope,
  scope,
  canExport,
  canRequest,
  employeeOption,
}: LeaveRequestsTableProps) {
  const t = useTranslations('leave');
  const tc = useTranslations('common');
  const ts = useTranslations('statuses');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const showEmployee = scope !== 'mine';

  const columns = useMemo<ColumnDef<LeaveRequestListRow>[]>(() => {
    const cols: ColumnDef<LeaveRequestListRow>[] = [];
    if (showEmployee) {
      cols.push({
        id: 'employee',
        accessorFn: (r) => r.employee.name_ar ?? r.employee.name_en ?? '',
        header: ({ column }) => <SortHeader column={column} title={t('fields.employee')} />,
        cell: ({ row }) => (
          <EmployeeCell
            employee={{ id: row.original.employee.id, name_ar: row.original.employee.name_ar, name_en: row.original.employee.name_en, avatarUrl: row.original.employee.avatarUrl }}
            subtitle={<bdi className="numeric">{row.original.employee.employee_number ?? '—'}</bdi>}
            size="sm"
          />
        ),
        meta: { label: t('fields.employee'), width: '15rem' },
        enableHiding: false,
      });
    }
    cols.push(
      {
        id: 'request_number',
        header: () => t('fields.requestNumber'),
        cell: ({ row }) =>
          row.original.request_number ? (
            <bdi className="font-mono text-meta text-muted-foreground">{row.original.request_number}</bdi>
          ) : (
            <span className="text-faint-foreground">—</span>
          ),
        enableSorting: false,
        meta: { label: t('fields.requestNumber'), defaultHidden: showEmployee, width: '9.5rem' },
      },
      {
        id: 'leave_type',
        header: () => t('fields.leaveType'),
        cell: ({ row }) => <LeaveTypeLabel type={row.original.leave_type} />,
        enableSorting: false,
        meta: { label: t('fields.leaveType') },
      },
      {
        id: 'start_date',
        accessorKey: 'start_date',
        header: ({ column }) => <SortHeader column={column} title={t('fields.period')} />,
        cell: ({ row }) => (
          <div className="leading-tight">
            <div className="numeric whitespace-nowrap text-foreground">{fmt.range(row.original.start_date, row.original.end_date)}</div>
            {row.original.return_date ? (
              <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                {t('fields.returnOn', { date: fmt.date(row.original.return_date) })}
              </div>
            ) : null}
          </div>
        ),
        meta: { label: t('fields.period') },
      },
      {
        id: 'days',
        accessorKey: 'days',
        header: ({ column }) => <SortHeader column={column} title={t('fields.days')} />,
        cell: ({ row }) => <span className="font-medium numeric">{formatDays(row.original.days, locale)}</span>,
        meta: { label: t('fields.days'), align: 'end', width: '5.5rem' },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <SortHeader column={column} title={tc('status')} />,
        cell: ({ row }) => <StatusBadge domain="request" status={row.original.status} />,
        meta: { label: tc('status') },
      },
      {
        id: 'step',
        header: () => t('fields.currentStep'),
        cell: ({ row }) => {
          const r = row.original;
          const pending = r.status === 'pending_manager_approval' || r.status === 'pending_hr_review' || r.status === 'submitted';
          if (!pending) return <span className="text-faint-foreground">—</span>;
          const step = r.current_step_type === 'manager' || r.status === 'pending_manager_approval' ? 'manager' : r.current_step_type === 'user' ? 'user' : r.current_step_type === 'role' ? 'role' : 'hr';
          return (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-foreground">{t(`steps.${step}`)}</div>
              {r.approver_name ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.approver_name}</div> : null}
            </div>
          );
        },
        enableSorting: false,
        meta: { label: t('fields.currentStep'), width: '11rem' },
      },
      {
        id: 'submitted',
        accessorKey: 'submitted_at',
        header: ({ column }) => <SortHeader column={column} title={t('fields.submitted')} />,
        cell: ({ row }) => (row.original.submitted_at ? <span className="numeric whitespace-nowrap">{fmt.date(row.original.submitted_at)}</span> : '—'),
        meta: { label: t('fields.submitted'), defaultHidden: true },
      },
      {
        id: 'department',
        header: () => tc('department'),
        cell: ({ row }) => (row.original.employee.department ? localized(row.original.employee.department, 'name', locale) : '—'),
        enableSorting: false,
        meta: { label: tc('department'), defaultHidden: true },
      },
      actionsColumn<LeaveRequestListRow>((row) => [
        { label: t('actions.openRequest'), icon: EyeIcon, href: `/requests/${row.request_id}` },
        { label: t('actions.viewInCalendar'), icon: CalendarRangeIcon, href: `/leave?tab=calendar&month=${row.start_date.slice(0, 7)}` },
      ]),
    );
    return cols;
  }, [showEmployee, t, tc, fmt, locale]);

  const filters: FilterDef<LeaveRequestListRow>[] = [
    {
      key: 'type',
      title: t('fields.leaveType'),
      icon: TagIcon,
      options: typeOptions.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      key: 'status',
      title: tc('status'),
      icon: CircleDotIcon,
      options: STATUS_OPTIONS.map((s) => ({ value: s, label: ts(`request.${s}`) })),
    },
    { type: 'dateRange', key: 'period', title: t('fields.period') },
  ];
  const moreFilters: FilterDef<LeaveRequestListRow>[] = [
    ...(scope !== 'mine' && departmentOptions.length ? [{ key: 'department', title: tc('department'), icon: BuildingIcon, options: departmentOptions }] : []),
    ...(employeeOption ? [{ key: 'employee', title: t('fields.employee'), icon: UserRoundIcon, options: [employeeOption], multiple: false }] : []),
  ];

  const scopeSwitch = (
    <UrlSegmented
      param="scope"
      defaultValue={defaultScope}
      aria-label={t('scope.label')}
      options={scopes.map((s) => ({ value: s, label: t(`scope.${s}`) }))}
    />
  );

  const requestButton = canRequest ? (
    <Button size="sm" asChild>
      <Link href="/requests/new?type=leave">
        <CalendarPlusIcon />
        {t('actions.requestLeave')}
      </Link>
    </Button>
  ) : null;

  return (
    <DataTable
      tableId="leave-requests"
      columns={columns}
      data={rows}
      total={total}
      getRowId={(r) => r.id}
      rowHref={(r) => `/requests/${r.request_id}`}
      filters={filters}
      moreFilters={moreFilters}
      searchable={scope !== 'mine'}
      searchPlaceholder={t('requests.searchPlaceholder')}
      exportDataset={canExport ? 'leave_requests' : undefined}
      toolbarActions={scopeSwitch}
      defaultSort={{ id: 'start_date', desc: true }}
      maxHeight="none"
      emptyState={{
        icon: CalendarRangeIcon,
        title: t('requests.emptyTitle'),
        description: scope === 'mine' ? t('requests.emptyMine') : t('requests.emptyScoped'),
        action: scope === 'mine' ? requestButton : undefined,
      }}
      renderMobileCard={(r) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            {showEmployee ? (
              <EmployeeCell
                employee={{ id: r.employee.id, name_ar: r.employee.name_ar, name_en: r.employee.name_en, avatarUrl: r.employee.avatarUrl }}
                subtitle={<LeaveTypeLabel type={r.leave_type} muted />}
                size="sm"
              />
            ) : (
              <LeaveTypeLabel type={r.leave_type} className="font-medium" />
            )}
            <StatusBadge domain="request" status={r.status} size="sm" />
          </div>
          <div className="flex items-center justify-between gap-3 text-meta text-muted-foreground">
            <span className="numeric">{fmt.range(r.start_date, r.end_date)}</span>
            <span className="font-medium text-foreground numeric">{tc('days', { count: r.days })}</span>
          </div>
        </div>
      )}
    />
  );
}

/** "Request leave" header action — disabled with a reason when the user can't request. */
export function RequestLeaveButton({ canRequest, reason }: { canRequest: boolean; reason?: string }) {
  const t = useTranslations('leave');
  if (canRequest) {
    return (
      <Button asChild>
        <Link href="/requests/new?type=leave">
          <CalendarPlusIcon />
          {t('actions.requestLeave')}
        </Link>
      </Button>
    );
  }
  return (
    <SimpleTooltip content={reason ?? t('actions.requestLeaveDisabled')}>
      <span tabIndex={0} className="inline-flex">
        <Button disabled>
          <CalendarPlusIcon />
          {t('actions.requestLeave')}
        </Button>
      </span>
    </SimpleTooltip>
  );
}
