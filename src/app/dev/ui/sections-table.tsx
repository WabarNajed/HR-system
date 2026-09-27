'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArchiveIcon, BuildingIcon, CircleDotIcon, EyeIcon, FilePlus2Icon, PencilIcon, UsersIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { actionsColumn, DataTable, DataTableColumnHeader, selectColumn, type FilterDef } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { GallerySection, useDevLabel } from './dev-label';
import { SAMPLE_DEPARTMENTS, SAMPLE_EMPLOYEES, type SampleEmployee } from './sample-data';

const TODAY = '2026-09-27';

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function TableSection() {
  const t = useTranslations();
  const L = useDevLabel();
  const locale = useLocale();
  const fmt = useDateFormat();

  const deptName = useMemo(
    () => Object.fromEntries(SAMPLE_DEPARTMENTS.map((d) => [d.id, locale === 'ar' ? d.name_ar : d.name_en])),
    [locale],
  );

  const columns = useMemo<ColumnDef<SampleEmployee>[]>(
    () => [
      selectColumn<SampleEmployee>(),
      {
        id: 'name',
        accessorFn: (row) => employeeDisplayName(row, locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.employee')} />,
        cell: ({ row }) => (
          <EmployeeCell
            employee={{ id: row.original.id, name_ar: row.original.name_ar, name_en: row.original.name_en }}
            subtitle={locale === 'ar' ? row.original.job_ar : row.original.job_en}
          />
        ),
        meta: { label: t('common.employee'), width: '16rem' },
        enableHiding: false,
      },
      {
        id: 'employee_number',
        accessorKey: 'employee_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title={L('الرقم الوظيفي', 'Employee ID')} />,
        cell: ({ getValue }) => <bdi className="font-medium text-muted-foreground">{getValue<string>()}</bdi>,
        meta: { label: L('الرقم الوظيفي', 'Employee ID') },
      },
      {
        id: 'department',
        accessorFn: (row) => deptName[row.department],
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.department')} />,
        meta: { label: t('common.department') },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.status')} />,
        cell: ({ getValue }) => <StatusBadge domain="employment" status={getValue<string>()} />,
        meta: { label: t('common.status') },
      },
      {
        id: 'iqama_expiry',
        accessorKey: 'iqama_expiry',
        header: ({ column }) => <DataTableColumnHeader column={column} title={L('انتهاء الإقامة', 'Iqama expiry')} />,
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          if (!v) return <span className="text-faint-foreground">—</span>;
          const days = daysBetween(TODAY, v);
          return (
            <div className="flex items-center gap-2">
              <span>{fmt.date(v)}</span>
              {days < 0 ? (
                <Badge variant="danger" size="sm">
                  {t('enums.expiryBucket.expired')}
                </Badge>
              ) : days <= 30 ? (
                <Badge variant="warning" size="sm">
                  {t('enums.expiryBucket.within30')}
                </Badge>
              ) : null}
            </div>
          );
        },
        meta: { label: L('انتهاء الإقامة', 'Iqama expiry') },
      },
      {
        id: 'joining_date',
        accessorKey: 'joining_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={L('تاريخ الالتحاق', 'Joining date')} />,
        cell: ({ getValue }) => fmt.date(getValue<string>()),
        meta: { label: L('تاريخ الالتحاق', 'Joining date'), defaultHidden: false },
      },
      actionsColumn<SampleEmployee>((row) => [
        { label: t('common.view'), icon: EyeIcon, onSelect: () => toast.info(employeeDisplayName(row, locale)) },
        { label: t('common.edit'), icon: PencilIcon, onSelect: () => toast.info(t('common.edit')) },
        { label: t('nav.items.newRequest'), icon: FilePlus2Icon, onSelect: () => toast.info(t('nav.items.newRequest')) },
        { label: t('common.archive'), icon: ArchiveIcon, variant: 'destructive', separatorBefore: true, onSelect: () => toast.success(t('common.saved')) },
      ]),
    ],
    [t, L, locale, fmt, deptName],
  );

  const filters: FilterDef<SampleEmployee>[] = [
    {
      key: 'status',
      title: t('common.status'),
      icon: CircleDotIcon,
      options: (['active', 'probation', 'on_leave', 'suspended', 'resigned'] as const).map((s) => ({
        value: s,
        label: t(`statuses.employment.${s}`),
        count: SAMPLE_EMPLOYEES.filter((e) => e.status === s).length,
      })),
    },
    {
      key: 'department',
      title: t('common.department'),
      icon: BuildingIcon,
      options: SAMPLE_DEPARTMENTS.map((d) => ({ value: d.id, label: deptName[d.id]! })),
    },
    { type: 'dateRange', key: 'joining', title: L('تاريخ الالتحاق', 'Joining date'), accessor: (r) => r.joining_date },
  ];

  const moreFilters: FilterDef<SampleEmployee>[] = [
    {
      key: 'gender',
      title: L('الجنس', 'Gender'),
      options: (['male', 'female'] as const).map((g) => ({ value: g, label: t(`enums.gender.${g}`) })),
    },
  ];

  return (
    <GallerySection id="table" title={L('جدول البيانات', 'Data table')} description={t('common.dev.sampleData')}>
      <DataTable
        tableId="dev-employees"
        mode="client"
        columns={columns}
        data={SAMPLE_EMPLOYEES}
        getRowId={(r) => r.id}
        onRowClick={(r) => toast.info(employeeDisplayName(r, locale))}
        filters={filters}
        moreFilters={moreFilters}
        searchText={(r) => `${r.name_ar} ${r.name_en} ${r.employee_number}`}
        enableRowSelection
        bulkActions={(rows, clear) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              toast.success(t('common.selectedCount', { count: rows.length }));
              clear();
            }}
          >
            <ArchiveIcon />
            {t('common.archive')}
          </Button>
        )}
        defaultSort={{ id: 'name', desc: false }}
        defaultPageSize={10}
        maxHeight="none"
        toolbarActions={
          <Button size="sm">
            <UsersIcon />
            {t('nav.header.addEmployee')}
          </Button>
        }
        renderMobileCard={(r) => (
          <div className="flex items-center justify-between gap-3">
            <EmployeeCell employee={{ id: r.id, name_ar: r.name_ar, name_en: r.name_en }} subtitle={`${r.employee_number} · ${deptName[r.department]}`} />
            <StatusBadge domain="employment" status={r.status} size="sm" />
          </div>
        )}
      />
      <div className="mt-6">
        <DataTable
          tableId="dev-empty"
          mode="client"
          columns={columns.slice(1, 5)}
          data={[]}
          pagination={false}
          emptyState={{ icon: UsersIcon, title: t('common.table.emptyTitle'), description: t('common.table.emptyDescription'), action: <Button size="sm">{t('nav.header.addEmployee')}</Button> }}
        />
      </div>
    </GallerySection>
  );
}
