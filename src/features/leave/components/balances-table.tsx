'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BuildingIcon, HistoryIcon, PencilLineIcon, SlidersHorizontalIcon, TagIcon, WalletCardsIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { actionsColumn, DataTable, type FilterDef } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { formatDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BalanceRow, Option } from '../types';
import { AdjustBalanceDialog, BalanceHistorySheet, EditBalanceDialog, type BalanceTarget } from './balance-dialogs';
import { SortHeader } from './sort-header';
import { BalanceBar } from './balance-cards';
import { LeaveTypeLabel } from './leave-type-dot';

export type BalancesTableProps = {
  rows: BalanceRow[];
  total: number;
  typeOptions: Option[];
  departmentOptions: Option[];
  canEdit: boolean;
  /**
   * The viewer's own employee id when `canEdit` must NOT apply to their own rows (segregation of
   * duties: HR can't change their own balance; the RPCs refuse it too). Null = no restriction.
   */
  lockedEmployeeId?: string | null;
  canExport: boolean;
  /** Extra toolbar controls (scope switch, year select, initialize). */
  toolbar?: ReactNode;
  emptyAction?: ReactNode;
};

export function BalancesTable({
  rows,
  total,
  typeOptions,
  departmentOptions,
  canEdit,
  lockedEmployeeId = null,
  canExport,
  toolbar,
  emptyAction,
}: BalancesTableProps) {
  const t = useTranslations('leave');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const d = useCallback((v: number) => formatDays(v, locale), [locale]);
  const [target, setTarget] = useState<BalanceTarget | null>(null);
  const [dialog, setDialog] = useState<'adjust' | 'edit' | 'history' | null>(null);
  const isLocked = useCallback((r: BalanceRow) => Boolean(lockedEmployeeId && r.employee?.id === lockedEmployeeId), [lockedEmployeeId]);

  const columns = useMemo<ColumnDef<BalanceRow>[]>(() => {
    const open = (kind: 'adjust' | 'edit' | 'history', row: BalanceRow) => {
      setTarget({ ...row, employeeName: row.employee ? { name_ar: row.employee.name_ar, name_en: row.employee.name_en } : null });
      setDialog(kind);
    };
    const num = (key: 'opening_balance' | 'entitlement' | 'adjustment' | 'used' | 'pending', label: string, hidden = false): ColumnDef<BalanceRow> => ({
      id: key,
      accessorKey: key,
      header: ({ column }) => <SortHeader column={column} title={label} />,
      cell: ({ row }) => {
        const v = row.original[key];
        return (
          <bdi dir="ltr" className={cn('numeric', v === 0 ? 'text-faint-foreground' : 'text-foreground', key === 'pending' && v > 0 && 'font-medium text-warning')}>
            {key === 'adjustment' && v > 0 ? '+' : ''}
            {d(v)}
          </bdi>
        );
      },
      meta: { label, align: 'end', headerClassName: 'whitespace-nowrap', defaultHidden: hidden },
    });
    return [
      {
        id: 'employee',
        accessorFn: (r) => r.employee?.name_ar ?? '',
        header: ({ column }) => <SortHeader column={column} title={t('fields.employee')} />,
        cell: ({ row }) =>
          row.original.employee ? (
            <EmployeeCell
              employee={{
                id: row.original.employee.id,
                name_ar: row.original.employee.name_ar,
                name_en: row.original.employee.name_en,
                avatarUrl: row.original.employee.avatarUrl,
              }}
              subtitle={
                <>
                  {row.original.employee.employee_number ? <bdi className="numeric">{row.original.employee.employee_number}</bdi> : null}
                  {row.original.employee.employee_number && row.original.employee.department ? ' · ' : ''}
                  {row.original.employee.department ? localized(row.original.employee.department, 'name', locale) : ''}
                </>
              }
              href={`/employees/${row.original.employee.id}?tab=leave`}
              size="sm"
            />
          ) : null,
        meta: { label: t('fields.employee'), width: '16rem' },
        enableHiding: false,
      },
      {
        id: 'leave_type',
        accessorFn: (r) => r.leave_type.sort_order,
        header: ({ column }) => <SortHeader column={column} title={t('fields.leaveType')} />,
        cell: ({ row }) => <LeaveTypeLabel type={row.original.leave_type} />,
        meta: { label: t('fields.leaveType') },
      },
      num('opening_balance', t('fields.opening')),
      num('entitlement', t('fields.entitlement')),
      num('adjustment', t('fields.adjustment')),
      num('used', t('fields.used')),
      num('pending', t('fields.pending')),
      {
        id: 'remaining',
        accessorKey: 'remaining',
        header: ({ column }) => <SortHeader column={column} title={t('fields.remaining')} />,
        cell: ({ row }) => (
          <div className="flex min-w-24 flex-col items-end gap-1">
            <span className={cn('font-semibold numeric', row.original.remaining < 0 ? 'text-danger' : 'text-foreground')}>{d(row.original.remaining)}</span>
            <BalanceBar row={row.original} className="h-1.5 w-20" />
          </div>
        ),
        meta: { label: t('fields.remaining'), align: 'end', headerClassName: 'whitespace-nowrap' },
      },
      {
        id: 'available',
        accessorKey: 'available',
        header: () => t('fields.available'),
        cell: ({ row }) => <span className="numeric text-muted-foreground">{d(row.original.available)}</span>,
        enableSorting: false,
        meta: { label: t('fields.available'), align: 'end', headerClassName: 'whitespace-nowrap', defaultHidden: true },
      },
      actionsColumn<BalanceRow>((row) => {
        const locked = isLocked(row);
        const lockedReason = locked ? t('balances.selfLocked') : undefined;
        return [
          { label: t('adjust.title'), icon: SlidersHorizontalIcon, onSelect: () => open('adjust', row), hidden: !canEdit, disabled: locked, disabledReason: lockedReason },
          { label: t('editBalance.title'), icon: PencilLineIcon, onSelect: () => open('edit', row), hidden: !canEdit, disabled: locked, disabledReason: lockedReason },
          { label: t('history.title'), icon: HistoryIcon, onSelect: () => open('history', row), separatorBefore: canEdit },
        ];
      }),
    ];
  }, [t, locale, canEdit, isLocked, d]);

  const filters: FilterDef<BalanceRow>[] = [
    { key: 'type', title: t('fields.leaveType'), icon: TagIcon, options: typeOptions },
    ...(departmentOptions.length ? [{ key: 'department', title: tc('department'), icon: BuildingIcon, options: departmentOptions }] : []),
  ];

  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };
  const openFor = (kind: 'adjust' | 'edit' | 'history', r: BalanceRow) => {
    setTarget({ ...r, employeeName: r.employee ? { name_ar: r.employee.name_ar, name_en: r.employee.name_en } : null });
    setDialog(kind);
  };

  return (
    <>
      <DataTable
        tableId="leave-balances"
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.id}
        onRowClick={(r) => openFor('history', r)}
        filters={filters}
        searchPlaceholder={t('balances.searchPlaceholder')}
        exportDataset={canExport ? 'leave_balances' : undefined}
        toolbarActions={toolbar}
        defaultSort={{ id: 'employee', desc: false }}
        maxHeight="none"
        density="compact"
        emptyState={{ icon: WalletCardsIcon, title: t('balances.tableEmptyTitle'), description: t('balances.tableEmptyDescription'), action: emptyAction }}
        renderMobileCard={(r) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              {r.employee ? (
                <EmployeeCell
                  employee={{ id: r.employee.id, name_ar: r.employee.name_ar, name_en: r.employee.name_en, avatarUrl: r.employee.avatarUrl }}
                  subtitle={<LeaveTypeLabel type={r.leave_type} muted />}
                  size="sm"
                />
              ) : null}
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-base font-semibold numeric">{d(r.remaining)}</span>
                <span className="text-xs text-muted-foreground">{t('fields.remaining')}</span>
              </div>
            </div>
            <BalanceBar row={r} />
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>
                  {t('fields.used')}: <span className="numeric text-foreground">{d(r.used)}</span>
                </span>
                <span>
                  {t('fields.pending')}: <span className="numeric text-foreground">{d(r.pending)}</span>
                </span>
                <span>
                  {t('fields.available')}: <span className="numeric text-foreground">{d(r.available)}</span>
                </span>
              </div>
              <div className="-me-1.5 flex shrink-0 items-center">
                {canEdit && !isLocked(r) ? (
                  <Button variant="ghost" size="icon-sm" aria-label={t('adjust.title')} onClick={() => openFor('adjust', r)}>
                    <SlidersHorizontalIcon />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon-sm" aria-label={t('history.title')} onClick={() => openFor('history', r)}>
                  <HistoryIcon />
                </Button>
              </div>
            </div>
          </div>
        )}
      />
      <AdjustBalanceDialog target={target} open={dialog === 'adjust'} onOpenChange={close} />
      <EditBalanceDialog target={target} open={dialog === 'edit'} onOpenChange={close} />
      <BalanceHistorySheet target={target} open={dialog === 'history'} onOpenChange={close} />
    </>
  );
}
