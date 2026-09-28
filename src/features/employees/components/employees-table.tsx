'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BriefcaseIcon,
  Building2Icon,
  CircleDotIcon,
  DownloadIcon,
  EyeIcon,
  FilePlus2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HeartHandshakeIcon,
  SheetIcon,
  ShieldPlusIcon,
  MapPinIcon,
  PencilIcon,
  UserPlusIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, exportHref, type FilterDef, type RowAction } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { employeeAlternateName, employeeDisplayName, localized } from '@/lib/i18n/localized';
import { fileRouteUrl } from '@/lib/storage';
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, GENDERS, IQAMA_FILTER_BUCKETS, type DirectoryRow, type Option } from '../types';
import { ArchiveEmployeeDialog, type ArchiveTarget } from './archive-employee-dialog';
import { ExpiryBadge } from './expiry-badge';

export type EmployeesTableProps = {
  rows: DirectoryRow[];
  total: number;
  options: { departments: Option[]; managers: Option[]; locations: Option[]; jobTitles: Option[]; nationalities: Option[] };
  /** Org-wide viewer (HR): sensitive columns, Iqama filter, portal column. */
  orgView: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canRequestFor: boolean;
  canExport: boolean;
  /** Related datasets the viewer may export with the same filters. */
  relatedExports?: { dependents: boolean; insurance: boolean };
  sensitiveSearch: boolean;
  today: string;
};

const avatarUrl = (path: string | null) => (path ? fileRouteUrl('employee-documents', path) : null);

export function EmployeesTable({
  rows,
  total,
  options,
  orgView,
  canEdit,
  canCreate,
  canRequestFor,
  canExport,
  relatedExports = { dependents: false, insurance: false },
  sensitiveSearch,
  today,
}: EmployeesTableProps) {
  const t = useTranslations('employees');
  const ts = useTranslations('statuses.employment');
  const te = useTranslations('enums');
  const locale = useLocale();
  const fmt = useDateFormat();
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);

  const columns = useMemo<ColumnDef<DirectoryRow>[]>(() => {
    const name = (r: { name_ar: string | null; name_en: string | null } | null) => (r ? localized(r, 'name', locale) : '');
    const dash = <span className="text-faint-foreground">—</span>;
    const cols: ColumnDef<DirectoryRow>[] = [
      {
        id: 'name',
        // An accessor makes the column sortable (TanStack); ordering itself happens on the server.
        accessorFn: (r) => employeeDisplayName(r, locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.employee')} />,
        meta: { label: t('columns.employee'), width: '15rem' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <EmployeeCell
              employee={{ id: r.id, name_ar: r.name_ar, name_en: r.name_en, avatarUrl: avatarUrl(r.avatar_path) }}
              subtitle={r.company_email ? <bdi dir="ltr">{r.company_email}</bdi> : employeeAlternateName(r, locale)}
              className="max-w-[15rem]"
              addon={
                r.archived_at ? (
                  <Badge variant="neutral" size="sm">
                    {t('directory.archived')}
                  </Badge>
                ) : null
              }
            />
          );
        },
      },
      {
        id: 'employee_number',
        accessorFn: (r) => r.employee_number,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.employeeNumber')} />,
        meta: { label: t('columns.employeeNumber'), width: '8.5rem' },
        cell: ({ row }) =>
          row.original.employee_number ? (
            <bdi dir="ltr" className="font-medium text-foreground tabular-nums">
              {row.original.employee_number}
            </bdi>
          ) : (
            dash
          ),
      },
      {
        id: 'job_title',
        enableSorting: false,
        header: () => t('columns.jobTitle'),
        meta: { label: t('columns.jobTitle') },
        cell: ({ row }) => <span className="block max-w-[11rem] truncate">{name(row.original.job_title) || dash}</span>,
      },
      {
        id: 'department',
        enableSorting: false,
        header: () => t('columns.department'),
        meta: { label: t('columns.department') },
        cell: ({ row }) => <span className="block max-w-[10rem] truncate">{name(row.original.department) || dash}</span>,
      },
      {
        id: 'manager',
        enableSorting: false,
        header: () => t('columns.manager'),
        meta: { label: t('columns.manager') },
        cell: ({ row }) => {
          const m = row.original.manager;
          return m ? (
            <span className="block max-w-[10rem] truncate text-muted-foreground">{employeeDisplayName(m, locale)}</span>
          ) : (
            dash
          );
        },
      },
      {
        id: 'employment_status',
        accessorFn: (r) => r.employment_status,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.status')} />,
        meta: { label: t('columns.status'), width: '8rem' },
        cell: ({ row }) => <StatusBadge domain="employment" status={row.original.employment_status} size="sm" />,
      },
    ];
    if (!orgView) {
      // Team view: every row reports to the viewer — the manager column adds nothing.
      const i = cols.findIndex((c) => c.id === 'manager');
      if (i >= 0) cols.splice(i, 1);
    }
    if (orgView) {
      cols.push({
        id: 'iqama_expiry_date',
        accessorFn: (r) => r.iqama_expiry_date,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.iqamaExpiry')} />,
        meta: { label: t('columns.iqamaExpiry'), width: '9rem' },
        cell: ({ row }) => {
          const d = row.original.iqama_expiry_date;
          if (!d) return dash;
          return (
            <div className="flex flex-col items-start gap-0.5 leading-tight">
              <span className="tabular-nums">{fmt.date(d)}</span>
              <ExpiryBadge date={d} today={today} hideValid />
            </div>
          );
        },
      });
    }
    cols.push(
      {
        id: 'location',
        enableSorting: false,
        header: () => t('columns.location'),
        meta: { label: t('columns.location'), defaultHidden: true },
        cell: ({ row }) => name(row.original.location) || dash,
      },
      {
        id: 'nationality',
        enableSorting: false,
        header: () => t('columns.nationality'),
        meta: { label: t('columns.nationality'), defaultHidden: true },
        cell: ({ row }) => row.original.nationality || dash,
      },
      {
        id: 'employment_type',
        enableSorting: false,
        header: () => t('columns.employmentType'),
        meta: { label: t('columns.employmentType'), defaultHidden: true },
        cell: ({ row }) => {
          const v = row.original.employment_type;
          return v && (EMPLOYMENT_TYPES as readonly string[]).includes(v) ? te(`employmentType.${v as (typeof EMPLOYMENT_TYPES)[number]}`) : dash;
        },
      },
      {
        id: 'joining_date',
        accessorFn: (r) => r.joining_date,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.joiningDate')} />,
        meta: { label: t('columns.joiningDate'), width: '8.5rem', defaultHidden: true },
        cell: ({ row }) => (row.original.joining_date ? <span className="tabular-nums">{fmt.date(row.original.joining_date)}</span> : dash),
      },
      {
        id: 'mobile',
        enableSorting: false,
        header: () => t('columns.mobile'),
        meta: { label: t('columns.mobile'), defaultHidden: true },
        cell: ({ row }) => (row.original.mobile ? <bdi dir="ltr" className="tabular-nums">{row.original.mobile}</bdi> : dash),
      },
    );
    if (orgView) {
      cols.push({
        id: 'portal',
        enableSorting: false,
        header: () => t('columns.portal'),
        meta: { label: t('columns.portal'), defaultHidden: true },
        cell: ({ row }) =>
          row.original.portal ? (
            <StatusBadge domain="profile" status={row.original.portal.status} size="sm" />
          ) : (
            <Badge variant="outline" size="sm">
              {t('filters.withoutPortal')}
            </Badge>
          ),
      });
    }
    cols.push(
      actionsColumn<DirectoryRow>((r) => {
        const archived = Boolean(r.archived_at);
        const actions: RowAction<DirectoryRow>[] = [
          { label: t('actions.view'), icon: EyeIcon, href: `/employees/${r.id}` },
          {
            label: t('actions.edit'),
            icon: PencilIcon,
            href: archived ? undefined : `/employees/${r.id}/edit`,
            hidden: !canEdit,
            disabled: archived,
            disabledReason: t('actions.editDisabledArchived'),
          },
          {
            label: t('actions.newRequestFor'),
            icon: FilePlus2Icon,
            href: archived ? undefined : `/requests/new?employee=${r.id}`,
            hidden: !canRequestFor,
            disabled: archived,
            disabledReason: t('actions.requestDisabled'),
          },
          {
            label: archived ? t('actions.restore') : t('actions.archive'),
            icon: archived ? ArchiveRestoreIcon : ArchiveIcon,
            variant: archived ? 'default' : 'destructive',
            hidden: !canEdit,
            separatorBefore: true,
            onSelect: () =>
              setArchiveTarget({ id: r.id, name: employeeDisplayName(r, locale) || r.employee_number || '', archived }),
          },
        ];
        return actions;
      }),
    );
    return cols;
  }, [t, te, locale, fmt, orgView, canEdit, canRequestFor, today]);

  const filters = useMemo<FilterDef<DirectoryRow>[]>(
    () => [
      { key: 'department', title: t('filters.department'), options: options.departments, icon: Building2Icon },
      {
        key: 'status',
        title: t('filters.status'),
        icon: CircleDotIcon,
        options: EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: ts(s) })),
      },
      ...(orgView ? [{ key: 'manager', title: t('filters.manager'), options: options.managers, icon: UserRoundIcon }] : []),
      { key: 'location', title: t('filters.location'), options: options.locations, icon: MapPinIcon },
    ],
    [t, ts, options, orgView],
  );

  const moreFilters = useMemo<FilterDef<DirectoryRow>[]>(() => {
    const defs: FilterDef<DirectoryRow>[] = [
      { key: 'jobTitle', title: t('filters.jobTitle'), options: options.jobTitles, icon: BriefcaseIcon },
      { key: 'nationality', title: t('filters.nationality'), options: options.nationalities },
      {
        key: 'employmentType',
        title: t('filters.employmentType'),
        options: EMPLOYMENT_TYPES.map((v) => ({ value: v, label: te(`employmentType.${v}`) })),
      },
      { key: 'gender', title: t('filters.gender'), options: GENDERS.map((v) => ({ value: v, label: te(`gender.${v}`) })) },
    ];
    if (orgView) {
      defs.push(
        {
          key: 'iqama',
          title: t('filters.iqamaExpiry'),
          multiple: false,
          options: IQAMA_FILTER_BUCKETS.map((v) => ({ value: v, label: te(`expiryBucket.${v}`) })),
        },
        {
          key: 'portal',
          title: t('filters.portalAccess'),
          multiple: false,
          options: [
            { value: 'with', label: t('filters.withPortal') },
            { value: 'without', label: t('filters.withoutPortal') },
          ],
        },
      );
    }
    defs.push({
      key: 'archived',
      title: t('filters.archived'),
      multiple: false,
      options: [
        { value: 'include', label: t('filters.includeArchived') },
        { value: 'only', label: t('filters.onlyArchived') },
      ],
    });
    return defs;
  }, [t, te, options, orgView]);

  return (
    <>
      <DataTable<DirectoryRow>
        tableId={orgView ? 'employees-directory' : 'employees-team'}
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.id}
        rowHref={(r) => `/employees/${r.id}`}
        filters={filters}
        moreFilters={moreFilters}
        searchPlaceholder={sensitiveSearch ? t('directory.searchPlaceholderSensitive') : t('directory.searchPlaceholder')}
        toolbarActions={canExport ? <EmployeesExportMenu related={relatedExports} /> : undefined}
        defaultSort={{ id: 'name', desc: false }}
        emptyState={
          orgView
            ? {
                icon: UsersIcon,
                title: t('directory.emptyTitle'),
                description: t('directory.emptyDescription'),
                action: canCreate ? (
                  <Button asChild size="sm">
                    <Link href="/employees/new">
                      <UserPlusIcon />
                      {t('actions.add')}
                    </Link>
                  </Button>
                ) : undefined,
              }
            : { icon: UsersIcon, title: t('directory.emptyTeamTitle'), description: t('directory.emptyTeamDescription') }
        }
        renderMobileCard={(r) => <MobileCard row={r} orgView={orgView} today={today} />}
      />
      <ArchiveEmployeeDialog target={archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)} />
    </>
  );
}

function MobileCard({ row, orgView, today }: { row: DirectoryRow; orgView: boolean; today: string }) {
  const t = useTranslations('employees');
  const locale = useLocale();
  const fmt = useDateFormat();
  const job = row.job_title ? localized(row.job_title, 'name', locale) : '';
  const dept = row.department ? localized(row.department, 'name', locale) : '';
  const meta = [job, dept].filter(Boolean).join(' · ');
  return (
    <div className="flex items-start gap-3">
      <EmployeeCell
        employee={{ id: row.id, name_ar: row.name_ar, name_en: row.name_en, avatarUrl: avatarUrl(row.avatar_path) }}
        subtitle={
          <span className="flex min-w-0 items-center gap-1.5">
            {row.employee_number ? (
              <bdi dir="ltr" className="font-medium text-foreground/80 tabular-nums">
                {row.employee_number}
              </bdi>
            ) : null}
            {row.employee_number && meta ? <span aria-hidden>·</span> : null}
            <span className="truncate">{meta}</span>
          </span>
        }
        className="min-w-0 flex-1"
        size="md"
      />
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge domain="employment" status={row.employment_status} size="sm" />
        {row.archived_at ? (
          <Badge variant="neutral" size="sm">
            {t('directory.archived')}
          </Badge>
        ) : orgView && row.iqama_expiry_date ? (
          <ExpiryBadge date={row.iqama_expiry_date} today={today} hideValid />
        ) : null}
        {orgView && row.iqama_expiry_date && !row.archived_at ? (
          <span className="text-xs text-muted-foreground tabular-nums">{t('directory.iqamaShort', { date: fmt.date(row.iqama_expiry_date) })}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Export menu: Excel/CSV use the full master dataset (`employees`), PDF the printable directory
 * (`employees_list`); related dependents/insurance exports apply the same filters.
 */
function EmployeesExportMenu({ related }: { related: { dependents: boolean; insurance: boolean } }) {
  const t = useTranslations('common.table');
  const te = useTranslations('employees.export');
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="active:scale-100">
          <DownloadIcon />
          <span className="hidden sm:inline">{t('export')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">{t('exportHint')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={exportHref('employees', 'xlsx', qs)} download>
            <FileSpreadsheetIcon />
            {t('exportExcel')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={exportHref('employees', 'csv', qs)} download>
            <SheetIcon />
            {t('exportCsv')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={exportHref('employees_list', 'pdf', qs)} download>
            <FileTextIcon />
            {t('exportPdf')}
          </a>
        </DropdownMenuItem>
        {related.dependents || related.insurance ? <DropdownMenuSeparator /> : null}
        {related.dependents ? (
          <DropdownMenuItem asChild>
            <a href={exportHref('dependents', 'xlsx', qs)} download>
              <HeartHandshakeIcon />
              {te('dependents')}
            </a>
          </DropdownMenuItem>
        ) : null}
        {related.insurance ? (
          <DropdownMenuItem asChild>
            <a href={exportHref('insurance', 'xlsx', qs)} download>
              <ShieldPlusIcon />
              {te('insurance')}
            </a>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
