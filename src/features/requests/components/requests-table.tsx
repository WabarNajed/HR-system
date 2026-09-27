'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  BanIcon,
  CheckCircle2Icon,
  EyeIcon,
  FilePenLineIcon,
  InboxIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
  XCircleIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef, type RowAction } from '@/components/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { deleteDraft } from '../actions';
import { rowCapabilities } from '../capabilities';
import { FILTER_STATUSES, SLA_STATES, TAB_STATUSES, type RequestTab } from '../constants';
import type { RequestActionKind } from '../schemas';
import type { RequestAccess, RequestListRow } from '../types';
import { DecisionDialog } from './decision-dialog';
import { RequestSlaBadge, StepLabel, subtypeLabel, TypeCell, TypeIcon } from './request-bits';

export type RequestFilterOptions = {
  types: { key: string; name_ar: string; name_en: string }[];
  departments: { id: string; name_ar: string | null; name_en: string | null }[] | null;
  employees: { id: string; name_ar: string | null; name_en: string | null; hint?: string | null }[] | null;
  handlers: { id: string; label_ar: string; label_en: string }[] | null;
};

/** Request Center table (server-side pagination/sort/filters via the URL). */
export function RequestsTable({
  rows,
  total,
  tab,
  access,
  options,
  showEmployee,
  exportable,
  canCreate,
}: {
  rows: RequestListRow[];
  total: number;
  tab: RequestTab;
  access: RequestAccess;
  options: RequestFilterOptions;
  showEmployee: boolean;
  exportable: boolean;
  canCreate: boolean;
}) {
  const t = useTranslations('requests');
  const ts = useTranslations('statuses');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const router = useRouter();
  const resolve = useErrorMessage();
  const [decision, setDecision] = useState<{ row: RequestListRow; action: RequestActionKind } | null>(null);
  const [toDelete, setToDelete] = useState<RequestListRow | null>(null);

  const summary = (row: RequestListRow) =>
    [row.type ? localized(row.type, 'name', locale) : null, row.employee ? employeeDisplayName(row.employee, locale) : null].filter(Boolean).join(' · ');

  const columns = useMemo<ColumnDef<RequestListRow>[]>(() => {
    const cols: ColumnDef<RequestListRow>[] = [
      {
        id: 'request_number',
        accessorKey: 'request_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.number')} />,
        meta: { label: t('columns.number'), width: '10.5rem' },
        cell: ({ row }) =>
          row.original.request_number ? (
            <bdi className="font-semibold text-foreground numeric">{row.original.request_number}</bdi>
          ) : (
            <span className="text-meta font-medium text-muted-foreground">{t('draftNumber')}</span>
          ),
      },
    ];
    if (showEmployee) {
      cols.push({
        id: 'employee',
        header: t('columns.employee'),
        enableSorting: false,
        meta: { label: t('columns.employee') },
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
      });
    }
    cols.push(
      {
        id: 'type',
        header: t('columns.type'),
        enableSorting: false,
        meta: { label: t('columns.type') },
        cell: ({ row }) => <TypeCell row={row.original} />,
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.created')} />,
        meta: { label: t('columns.created') },
        cell: ({ row }) => <span className="text-muted-foreground numeric">{fmt.date(row.original.created_at)}</span>,
      },
      {
        id: 'step',
        header: t('columns.step'),
        enableSorting: false,
        meta: { label: t('columns.step') },
        cell: ({ row }) => <StepLabel row={row.original} />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.status')} />,
        meta: { label: t('columns.status') },
        cell: ({ row }) => <StatusBadge domain="request" status={row.original.status} />,
      },
      {
        id: 'assigned',
        header: t('columns.assigned'),
        enableSorting: false,
        meta: { label: t('columns.assigned'), defaultHidden: !access.orgView },
        cell: ({ row }) =>
          row.original.assignee_name ? (
            <span className="text-sm text-foreground">{row.original.assignee_name}</span>
          ) : (
            <span className="text-meta text-faint-foreground">{t('unassigned')}</span>
          ),
      },
      {
        id: 'due_at',
        accessorKey: 'due_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.sla')} />,
        meta: { label: t('columns.sla') },
        cell: ({ row }) => <RequestSlaBadge row={row.original} />,
      },
      actionsColumn<RequestListRow>((row) => {
        const caps = rowCapabilities(row, access);
        const actions: RowAction<RequestListRow>[] = [
          { label: t('rowActions.view'), icon: EyeIcon, href: `/requests/${row.id}` },
          { label: t('rowActions.continueDraft'), icon: FilePenLineIcon, href: `/requests/new?draft=${row.id}`, hidden: !caps.canEditDraft },
          { label: t('rowActions.editResubmit'), icon: FilePenLineIcon, href: `/requests/${row.id}?edit=1`, hidden: !caps.canResubmit },
          { label: tc('approve'), icon: CheckCircle2Icon, onSelect: (r) => setDecision({ row: r, action: 'approve' }), hidden: !caps.canApprove, separatorBefore: true },
          { label: t('rowActions.return'), icon: Undo2Icon, onSelect: (r) => setDecision({ row: r, action: 'return' }), hidden: !caps.canReturn },
          { label: tc('reject'), icon: XCircleIcon, onSelect: (r) => setDecision({ row: r, action: 'reject' }), hidden: !caps.canReject, variant: 'destructive' },
          {
            label: t('rowActions.cancel'),
            icon: BanIcon,
            onSelect: (r) => setDecision({ row: r, action: 'cancel' }),
            hidden: !caps.canCancel || row.status === 'draft',
            variant: 'destructive',
            separatorBefore: !caps.canApprove,
          },
          { label: t('rowActions.deleteDraft'), icon: Trash2Icon, onSelect: (r) => setToDelete(r), hidden: !caps.canEditDraft, variant: 'destructive', separatorBefore: true },
        ];
        return actions;
      }),
    );
    return cols;
  }, [t, tc, fmt, locale, showEmployee, access]);

  const tabStatuses = TAB_STATUSES[tab];
  const statusOptions = (tabStatuses ?? FILTER_STATUSES).map((s) => ({ value: s, label: ts(`request.${s}`) }));

  const filters: FilterDef<RequestListRow>[] = [
    {
      key: 'type',
      title: t('filters.type'),
      options: options.types.map((x) => ({ value: x.key, label: localized(x, 'name', locale) })),
    },
  ];
  if (statusOptions.length > 1) filters.push({ key: 'status', title: t('filters.status'), options: statusOptions });
  if (tab !== 'drafts' && tab !== 'returned' && tab !== 'completed' && tab !== 'rejected') {
    filters.push({
      key: 'sla',
      title: t('filters.sla'),
      multiple: false,
      options: SLA_STATES.map((s) => ({ value: s, label: ts(`sla.${s}`) })),
    });
  }

  const moreFilters: FilterDef<RequestListRow>[] = [];
  if (options.employees?.length) {
    moreFilters.push({
      key: 'employee',
      title: t('filters.employee'),
      options: options.employees.map((e) => ({ value: e.id, label: [employeeDisplayName(e, locale), e.hint].filter(Boolean).join(' · ') })),
    });
  }
  if (options.departments?.length) {
    moreFilters.push({ key: 'department', title: t('filters.department'), options: options.departments.map((d) => ({ value: d.id, label: localized(d, 'name', locale) })) });
  }
  if (options.handlers) {
    moreFilters.push({
      key: 'assigned',
      title: t('filters.assigned'),
      options: [
        { value: 'me', label: t('filters.assignedToMe') },
        { value: 'none', label: t('unassigned') },
        ...options.handlers.filter((h) => h.id !== access.userId).map((h) => ({ value: h.id, label: locale === 'en' ? h.label_en : h.label_ar })),
      ],
    });
  }
  moreFilters.push({ type: 'dateRange', key: 'created', title: t('filters.created') });

  const emptyAction = canCreate ? (
    <Button asChild size="sm">
      <Link href="/requests/new">
        <PlusIcon />
        {t('newRequest')}
      </Link>
    </Button>
  ) : undefined;

  return (
    <>
      <DataTable
        tableId={`requests-${access.orgView ? 'hr' : 'self'}`}
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.id}
        rowHref={(r) => `/requests/${r.id}`}
        filters={filters}
        moreFilters={moreFilters}
        searchPlaceholder={showEmployee ? t('filters.searchPlaceholder') : t('filters.searchOwnPlaceholder')}
        exportDataset={exportable ? 'requests' : undefined}
        defaultSort={{ id: 'created_at', desc: true }}
        emptyState={{ icon: InboxIcon, title: t(`empty.${tab}.title`), description: t(`empty.${tab}.description`), action: tab === 'all' || tab === 'drafts' ? emptyAction : undefined }}
        renderMobileCard={(row) => <MobileCard row={row} showEmployee={showEmployee} />}
      />
      <DecisionDialog
        action={decision?.action ?? null}
        target={decision ? { id: decision.row.id, number: decision.row.request_number, summary: summary(decision.row) } : null}
        open={Boolean(decision)}
        onOpenChange={(o) => !o && setDecision(null)}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        variant="danger"
        title={t('deleteDraft.title')}
        description={t('deleteDraft.description')}
        confirmLabel={t('deleteDraft.confirm')}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteDraft({ requestId: toDelete.id });
          if (!res.ok) {
            toast.error(resolve(res.error));
            return false;
          }
          toast.success(t('toast.draftDeleted'));
          router.refresh();
        }}
      />
    </>
  );
}

function MobileCard({ row, showEmployee }: { row: RequestListRow; showEmployee: boolean }) {
  const t = useTranslations('requests');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const sub = subtypeLabel(row, locale);
  return (
    <div className="flex items-start gap-3">
      <TypeIcon icon={row.type?.icon} color={row.type?.color} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{row.type ? localized(row.type, 'name', locale) : t('unknownType')}</p>
          <StatusBadge domain="request" status={row.status} size="sm" />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          <bdi className="numeric">{row.request_number ?? t('draftNumber')}</bdi>
          {sub ? ` · ${sub}` : ''}
          {showEmployee && row.employee ? ` · ${employeeDisplayName(row.employee, locale)}` : ''}
        </p>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-xs text-muted-foreground numeric">{fmt.date(row.submitted_at ?? row.created_at)}</span>
          <RequestSlaBadge row={row} />
        </div>
      </div>
    </div>
  );
}
