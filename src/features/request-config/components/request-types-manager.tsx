'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ClipboardListIcon,
  CopyIcon,
  FormInputIcon,
  GitBranchIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  TimerIcon,
  Trash2Icon,
  UserCheckIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef, type RowAction } from '@/components/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { formatInteger, formatNumber } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { deleteRequestType, duplicateRequestType, setRequestTypeActive } from '../actions';
import { duplicateRequestTypeSchema, type DuplicateRequestTypeValues } from '../schemas';
import type { RequestTypeRow, RoleOption } from '../types';
import { categoryLabel } from './labels';
import { RequestTypeSheet } from './request-type-sheet';
import { ApprovalPathChips, RequestTypeIcon } from './type-visual';

type Props = { rows: RequestTypeRow[]; roles: RoleOption[]; canEdit: boolean };

/** Settings › Request types: KPI row · catalog table · create/edit sheet · duplicate · (de)activate · delete-when-unused. */
export function RequestTypesManager({ rows, roles, canEdit }: Props) {
  const t = useTranslations('requestConfig');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const resolve = useErrorMessage();
  const [sheet, setSheet] = useState<{ open: boolean; row: RequestTypeRow | null }>({ open: false, row: null });
  const [duplicateOf, setDuplicateOf] = useState<RequestTypeRow | null>(null);
  const [toDelete, setToDelete] = useState<RequestTypeRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const n = (v: number) => formatInteger(v, locale);
  const active = rows.filter((r) => r.is_active);
  const withSla = active.filter((r) => r.sla_business_days !== null && r.sla_business_days > 0);
  const avgSla = withSla.length ? withSla.reduce((s, r) => s + (r.sla_business_days ?? 0), 0) / withSla.length : null;
  const openTotal = rows.reduce((s, r) => s + r.usage.open, 0);
  const overdueTotal = rows.reduce((s, r) => s + r.usage.overdueOpen, 0);
  const custom = rows.filter((r) => r.workflowKind === 'custom').length;
  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))), [rows]);
  const nextSortOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;

  const toggleActive = (row: RequestTypeRow, next: boolean) => {
    setBusyId(row.id);
    startTransition(async () => {
      const result = await setRequestTypeActive({ id: row.id, active: next });
      setBusyId(null);
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      router.refresh();
    });
  };

  const rowActions = (r: RequestTypeRow): RowAction<RequestTypeRow>[] => [
    { label: canEdit ? t('types.actions.edit') : tc('viewDetails'), icon: PencilIcon, onSelect: () => setSheet({ open: true, row: r }) },
    { label: t('types.actions.editForm'), icon: FormInputIcon, href: `/settings/form-builder?type=${r.key}` },
    { label: t('types.actions.editWorkflow'), icon: GitBranchIcon, href: `/settings/workflows?type=${r.key}` },
    { label: tc('duplicate'), icon: CopyIcon, onSelect: () => setDuplicateOf(r), hidden: !canEdit, separatorBefore: true },
    {
      label: r.is_active ? tc('deactivate') : tc('activate'),
      icon: r.is_active ? PowerOffIcon : PowerIcon,
      onSelect: () => toggleActive(r, !r.is_active),
      hidden: !canEdit,
    },
    {
      label: tc('delete'),
      icon: Trash2Icon,
      variant: 'destructive',
      onSelect: () => setToDelete(r),
      hidden: !canEdit,
      disabled: r.is_system || r.usage.total > 0,
      disabledReason: r.is_system ? t('types.deleteSystem') : r.usage.total > 0 ? t('types.deleteInUse') : undefined,
      separatorBefore: true,
    },
  ];

  const columns = useMemo<ColumnDef<RequestTypeRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => localized(r, 'name', locale),
        sortingFn: (a, b) => localized(a.original, 'name', locale).localeCompare(localized(b.original, 'name', locale), locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('types.columns.type')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex max-w-80 min-w-48 items-center gap-2.5 whitespace-normal">
              <RequestTypeIcon icon={r.icon} color={r.color} />
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground" title={r.key}>
                    {localized(r, 'name', locale)}
                  </span>
                  {r.is_system ? (
                    <SimpleTooltip content={t('types.systemHint')}>
                      <LockIcon tabIndex={0} aria-label={t('types.system')} className="size-3 shrink-0 text-faint-foreground outline-none" />
                    </SimpleTooltip>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                  <span>{categoryLabel(tRoot, r.category)}</span>
                  <span aria-hidden>·</span>
                  <span>{t('types.fieldsCount', { count: r.activeFieldsCount })}</span>
                </div>
              </div>
            </div>
          );
        },
        meta: { label: t('types.columns.type') },
      },
      {
        id: 'category',
        accessorFn: (r) => categoryLabel(tRoot, r.category),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('types.columns.category')} />,
        cell: ({ row }) => <span className="text-foreground">{categoryLabel(tRoot, row.original.category)}</span>,
        meta: { label: t('types.columns.category'), defaultHidden: true },
      },
      {
        id: 'workflow',
        accessorFn: (r) => r.steps.length,
        enableSorting: false,
        header: () => t('types.columns.approvals'),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <ApprovalPathChips steps={row.original.steps} roles={roles} className="flex-nowrap whitespace-nowrap" />
            {row.original.workflowKind === 'custom' ? <span className="text-2xs text-secondary-soft-foreground">{t('workflows.kind.custom')}</span> : null}
          </div>
        ),
        meta: { label: t('types.columns.approvals') },
      },
      {
        id: 'sla',
        accessorFn: (r) => r.sla_business_days ?? -1,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('types.columns.sla')} />,
        cell: ({ row }) =>
          row.original.sla_business_days !== null ? (
            <span className="numeric whitespace-nowrap text-foreground">{t('businessDays', { count: row.original.sla_business_days })}</span>
          ) : (
            <span className="text-faint-foreground">{t('sla.notSet')}</span>
          ),
        // Low priority next to the approval path (SLA has its own settings page): off by default below 1536px.
        meta: { label: t('types.columns.sla'), width: '8.5rem', defaultHiddenBelow: 1536 },
      },
      {
        id: 'usage',
        accessorFn: (r) => r.usage.total,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('types.columns.usage')} />,
        cell: ({ row }) => {
          const u = row.original.usage;
          return (
            <div className="leading-tight">
              <div className="numeric text-foreground">{n(u.total)}</div>
              {u.open ? <div className="text-xs text-muted-foreground">{t('types.openCount', { count: u.open })}</div> : null}
            </div>
          );
        },
        meta: { label: t('types.columns.usage'), align: 'end', width: '6.5rem' },
      },
      {
        id: 'status',
        accessorFn: (r) => (r.is_active ? 'active' : 'inactive'),
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('status')} />,
        cell: ({ row }) =>
          canEdit ? (
            <SimpleTooltip content={row.original.is_active ? tc('active') : tc('inactive')}>
              <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={row.original.is_active}
                  disabled={busyId === row.original.id}
                  onCheckedChange={(v) => toggleActive(row.original, v)}
                  aria-label={`${localized(row.original, 'name', locale)} · ${row.original.is_active ? tc('active') : tc('inactive')}`}
                />
              </span>
            </SimpleTooltip>
          ) : (
            <StatusBadge domain="record" status={row.original.is_active ? 'active' : 'inactive'} size="sm" />
          ),
        meta: { label: tc('status'), width: '6rem' },
      },
      actionsColumn<RequestTypeRow>(rowActions),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, canEdit, busyId, roles],
  );

  const filters: FilterDef<RequestTypeRow>[] = [
    {
      key: 'category',
      title: t('types.columns.category'),
      options: categories.map((c) => ({ value: c, label: categoryLabel(tRoot, c), count: rows.filter((r) => r.category === c).length })),
      accessor: (r) => r.category,
    },
    {
      key: 'status',
      title: tc('status'),
      options: [
        { value: 'active', label: tc('active'), count: active.length },
        { value: 'inactive', label: tc('inactive'), count: rows.length - active.length },
      ],
      accessor: (r) => (r.is_active ? 'active' : 'inactive'),
    },
    {
      key: 'workflow',
      title: t('types.filters.workflow'),
      options: [
        { value: 'standard', label: t('workflows.kind.standard') },
        { value: 'custom', label: t('workflows.kind.custom') },
        { value: 'manager', label: t('types.filters.managerStep') },
      ],
      accessor: (r) => [r.workflowKind, ...(r.steps.some((s) => s.step_type === 'manager') ? ['manager'] : [])],
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        compact
        title={t('types.title')}
        description={t('types.description')}
        actions={
          canEdit ? (
            <Button onClick={() => setSheet({ open: true, row: null })}>
              <PlusIcon />
              {t('types.create')}
            </Button>
          ) : null
        }
      />
      <KpiGrid>
        <StatCard label={t('types.kpi.active')} value={n(active.length)} icon={ClipboardListIcon} tone="primary" hint={t('types.kpi.activeHint', { total: rows.length })} />
        <StatCard
          label={t('types.kpi.managerApproval')}
          value={n(active.filter((r) => r.steps.some((s) => s.step_type === 'manager')).length)}
          icon={UserCheckIcon}
          tone="info"
          hint={t('types.kpi.customWorkflows', { count: custom })}
        />
        <StatCard
          label={t('types.kpi.avgSla')}
          value={avgSla !== null ? formatNumber(avgSla, locale, { maximumFractionDigits: 1 }) : '—'}
          icon={TimerIcon}
          tone="secondary"
          hint={t('types.kpi.avgSlaHint')}
        />
        <StatCard
          label={t('types.kpi.open')}
          value={n(openTotal)}
          icon={WorkflowIcon}
          tone={overdueTotal ? 'danger' : 'success'}
          hint={overdueTotal ? t('types.kpi.overdue', { count: overdueTotal }) : t('types.kpi.noOverdue')}
        />
      </KpiGrid>

      <DataTable
        tableId="settings-request-types"
        mode="client"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => setSheet({ open: true, row: r })}
        searchable
        searchPlaceholder={t('types.searchPlaceholder')}
        searchText={(r) => [r.name_ar, r.name_en, r.key, r.description_ar ?? '', r.description_en ?? ''].join(' ')}
        filters={filters}
        pagination={false}
        maxHeight="none"
        emptyState={{
          icon: ClipboardListIcon,
          title: t('types.emptyTitle'),
          description: t('types.emptyDescription'),
          action: canEdit ? (
            <Button size="sm" onClick={() => setSheet({ open: true, row: null })}>
              <PlusIcon />
              {t('types.create')}
            </Button>
          ) : undefined,
        }}
        renderMobileCard={(r) => <MobileCard row={r} roles={roles} actions={rowActions(r)} onOpen={() => setSheet({ open: true, row: r })} />}
      />

      <RequestTypeSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        row={sheet.row}
        categories={categories}
        nextSortOrder={nextSortOrder}
        readOnly={!canEdit}
      />
      <DuplicateDialog source={duplicateOf} onOpenChange={(open) => !open && setDuplicateOf(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        variant="danger"
        title={t('types.deleteTitle')}
        description={toDelete ? t('types.deleteDescription', { name: localized(toDelete, 'name', locale) }) : undefined}
        confirmLabel={tc('delete')}
        onConfirm={async () => {
          if (!toDelete) return;
          const result = await deleteRequestType({ id: toDelete.id });
          if (!result.ok) {
            toast.error(resolve(result.error));
            return false;
          }
          toast.success(resolve(result.message));
          setToDelete(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function MobileCard({ row, roles, actions, onOpen }: { row: RequestTypeRow; roles: RoleOption[]; actions: RowAction<RequestTypeRow>[]; onOpen: () => void }) {
  const t = useTranslations('requestConfig');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const visible = actions.filter((a) => !a.hidden);
  return (
    <div className="flex items-start gap-3">
      <RequestTypeIcon icon={row.icon} color={row.color} className="mt-0.5" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start outline-none focus-visible:underline">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">{localized(row, 'name', locale)}</span>
          <StatusBadge domain="record" status={row.is_active ? 'active' : 'inactive'} size="sm" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{categoryLabel(tRoot, row.category)}</span>
          <span>·</span>
          <span>{row.sla_business_days !== null ? t('businessDays', { count: row.sla_business_days }) : t('sla.notSet')}</span>
          <span>·</span>
          <span>{t('types.fieldsCount', { count: row.activeFieldsCount })}</span>
        </div>
        <ApprovalPathChips steps={row.steps} roles={roles} className="mt-2" />
      </button>
      {visible.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={tc('moreActions')}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {visible.map((a, i) => {
              const ItemIcon = a.icon;
              return [
                a.separatorBefore && i > 0 ? <DropdownMenuSeparator key={`sep-${a.label}`} /> : null,
                <DropdownMenuItem
                  key={a.label}
                  variant={a.variant}
                  disabled={a.disabled}
                  title={a.disabled ? a.disabledReason : undefined}
                  onSelect={() => (a.href ? router.push(a.href) : a.onSelect?.(row))}
                >
                  {ItemIcon ? <ItemIcon /> : null}
                  {a.label}
                </DropdownMenuItem>,
              ];
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function DuplicateDialog({ source, onOpenChange }: { source: RequestTypeRow | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('requestConfig');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const form = useForm<DuplicateRequestTypeValues>({
    resolver: zodResolver(duplicateRequestTypeSchema),
    defaultValues: { sourceId: '', key: '', nameAr: '', nameEn: '' },
  });

  useEffect(() => {
    if (source) {
      form.reset({
        sourceId: source.id,
        key: `${source.key}_copy`.slice(0, 60),
        nameAr: `${source.name_ar} ${t('types.duplicate.suffixAr')}`,
        nameEn: `${source.name_en} ${t('types.duplicate.suffixEn')}`,
      });
    }
  }, [source, form, t]);

  const onSubmit = (values: DuplicateRequestTypeValues) =>
    startTransition(async () => {
      const result = await duplicateRequestType(values);
      if (!result.ok) {
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof DuplicateRequestTypeValues, { message: key }, { shouldFocus: true });
        }
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Dialog open={Boolean(source)} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('types.duplicate.title')}</DialogTitle>
          <DialogDescription>{source ? t('types.duplicate.description', { name: localized(source, 'name', locale) }) : null}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="duplicate-type-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <DialogBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tc('nameAr')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" lang="ar" autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tc('nameEn')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="ltr" lang="en" autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('types.fields.key')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" autoComplete="off" spellCheck={false} className="font-mono text-[0.8125rem]" onChange={(e) => field.onChange(e.target.value.toLowerCase())} />
                    </FormControl>
                    <FormDescription>{t('types.duplicate.hint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </DialogBody>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="duplicate-type-form" loading={pending}>
            <CopyIcon />
            {tc('duplicate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
