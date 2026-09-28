'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  CircleCheckIcon,
  CircleOffIcon,
  EyeIcon,
  GitForkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundXIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { actionsColumn, DataTable, DataTableColumnHeader, selectColumn, type FilterDef, type RowAction } from '@/components/data-table';
import type { ComboboxOption } from '@/components/shared/combobox';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useErrorMessage } from '@/components/ui/form';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { resolveLocale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { deleteMasterData, setMasterDataActive } from '../actions';
import { MASTER_ENTITY_CONFIG, type MasterDataKpis, type MasterDataRow, type MasterEntity } from '../config';
import { MasterDataSheet, type DepartmentOption } from './master-data-sheet';

export type MasterDataManagerProps = {
  entity: MasterEntity;
  rows: MasterDataRow[];
  kpis: MasterDataKpis;
  departments: DepartmentOption[];
  /** Locations: ISO 3166 country options (value = code, label = localized name). */
  countries: ComboboxOption[];
  canEdit: boolean;
  canExport: boolean;
  /** `/admin/data-management?type=…` when the viewer may import, else null. */
  importHref: string | null;
};

type SheetState = { open: boolean; row: MasterDataRow | null };

/** Header · KPI row · table · sheet · dialogs for one master data entity. */
export function MasterDataManager({ entity, rows, kpis, departments, countries, canEdit, canExport, importHref }: MasterDataManagerProps) {
  const config = MASTER_ENTITY_CONFIG[entity];
  const t = useTranslations('masterData');
  const tc = useTranslations('common');
  const te = useTranslations(`masterData.entities.${config.key}`);
  const locale = resolveLocale(useLocale());
  const df = useDateFormat();
  const resolve = useErrorMessage();
  const [, startTransition] = useTransition();
  const [bulkPending, startBulk] = useTransition();

  const [sheet, setSheet] = useState<SheetState>({ open: false, row: null });
  const [toDelete, setToDelete] = useState<MasterDataRow | null>(null);
  const [inUse, setInUse] = useState<MasterDataRow | null>(null);
  const [toDeactivate, setToDeactivate] = useState<MasterDataRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Clears the table selection once a bulk deactivation (confirmed in a dialog) succeeds. */
  const clearSelection = useRef<(() => void) | null>(null);

  const openCreate = () => setSheet({ open: true, row: null });
  const openEdit = (row: MasterDataRow) => setSheet({ open: true, row });

  const nameOf = (row: MasterDataRow) => localized(row, 'name', locale) || row.code || '—';
  const countryNames = useMemo(() => new Map(countries.map((c) => [c.value, c.label])), [countries]);
  /** Stored country (ISO code from the picker, or free text from imports) → display label. */
  const countryOf = (value: string | null) => (value ? (countryNames.get(value.trim().toUpperCase()) ?? value) : null);

  async function applyActive(ids: string[], active: boolean): Promise<boolean> {
    const result = await setMasterDataActive({ entity, ids, active });
    if (!result.ok) {
      toast.error(resolve(result.error));
      return false;
    }
    const count = result.data?.count ?? ids.length;
    toast.success(count > 1 ? t(active ? 'toast.bulkActivated' : 'toast.bulkDeactivated', { count }) : resolve(result.message));
    return true;
  }

  const activate = (row: MasterDataRow) => {
    setBusyId(row.id);
    startTransition(async () => {
      await applyActive([row.id], true);
      setBusyId(null);
    });
  };

  const requestDelete = (row: MasterDataRow) => {
    if (row.allEmployees > 0 || row.children > 0) setInUse(row);
    else setToDelete(row);
  };

  const rowActions = (row: MasterDataRow): RowAction<MasterDataRow>[] => [
    { label: canEdit ? tc('edit') : tc('view'), icon: canEdit ? PencilIcon : EyeIcon, onSelect: openEdit },
    row.is_active
      ? { label: tc('deactivate'), icon: PowerOffIcon, onSelect: (r) => setToDeactivate([r]), hidden: !canEdit }
      : { label: tc('activate'), icon: PowerIcon, onSelect: activate, hidden: !canEdit, disabled: busyId === row.id },
    { label: tc('delete'), icon: Trash2Icon, variant: 'destructive', onSelect: requestDelete, hidden: !canEdit, separatorBefore: true },
  ];

  /* ─── Columns ─────────────────────────────────────────────────────────── */
  const columns = useMemo<ColumnDef<MasterDataRow>[]>(() => {
    const cols: ColumnDef<MasterDataRow>[] = [];
    if (canEdit) cols.push(selectColumn<MasterDataRow>());
    cols.push(
      {
        id: 'code',
        accessorFn: (r) => r.code ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('code')} />,
        cell: ({ row }) =>
          row.original.code ? (
            <span dir="ltr" className="inline-flex rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
              {row.original.code}
            </span>
          ) : (
            <span className="text-faint-foreground">—</span>
          ),
        meta: { label: tc('code'), width: '7rem' },
      },
      {
        id: 'name',
        accessorFn: (r) => localized(r, 'name', locale),
        sortingFn: (a, b) => localized(a.original, 'name', locale).localeCompare(localized(b.original, 'name', locale), locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('name')} />,
        cell: ({ row }) => {
          const r = row.original;
          const primary = localized(r, 'name', locale);
          const other = locale === 'ar' ? r.name_en : r.name_ar;
          return (
            <div className="max-w-80 min-w-36 leading-tight whitespace-normal">
              <div className="line-clamp-2 font-medium break-words text-foreground">{primary}</div>
              {other && other !== primary ? <div className="mt-0.5 line-clamp-1 text-xs break-all text-muted-foreground">{other}</div> : null}
            </div>
          );
        },
        meta: { label: tc('name') },
      },
    );
    if (config.hasHierarchy) {
      cols.push(
        {
          id: 'parent',
          accessorFn: (r) => (r.parent ? localized(r.parent, 'name', locale) : ''),
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.parent')} />,
          cell: ({ row }) =>
            row.original.parent ? (
              <span className="flex max-w-56 min-w-28 items-start gap-1.5 leading-snug whitespace-normal text-foreground">
                <GitForkIcon className="mt-0.5 size-3.5 shrink-0 text-faint-foreground" aria-hidden />
                <span className="line-clamp-2 break-words">{localized(row.original.parent, 'name', locale)}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t('columns.topLevel')}</span>
            ),
          meta: { label: t('columns.parent') },
        },
        {
          id: 'head',
          accessorFn: (r) => (r.head ? employeeDisplayName(r.head, locale) : ''),
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.head')} />,
          cell: ({ row }) => {
            const head = row.original.head;
            if (!head) return <span className="text-xs text-muted-foreground">{t('columns.noHead')}</span>;
            const headName = employeeDisplayName(head, locale);
            return (
              <div className="flex max-w-56 min-w-32 items-center gap-2 whitespace-normal">
                <EmployeeAvatar name={headName} seed={head.id} size="xs" />
                <div className="min-w-0 leading-tight">
                  <div className="line-clamp-2 text-foreground break-words">{headName}</div>
                  {head.employee_number ? (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{head.employee_number}</div>
                  ) : null}
                </div>
              </div>
            );
          },
          meta: { label: t('columns.head') },
        },
      );
    }
    if (config.hasPlace) {
      cols.push({
        id: 'city',
        accessorFn: (r) => [r.city, countryOf(r.country)].filter(Boolean).join(' · '),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.place')} />,
        cell: ({ row }) => {
          const city = row.original.city;
          const country = countryOf(row.original.country);
          if (!city && !country) return <span className="text-faint-foreground">—</span>;
          return (
            <div className="max-w-60 min-w-24 leading-tight">
              <div className="truncate text-foreground">{city || country}</div>
              {city && country ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{country}</div> : null}
            </div>
          );
        },
        meta: { label: t('columns.place') },
      });
    }
    cols.push(
      {
        id: 'employees',
        accessorFn: (r) => r.employees,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.employees')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-end leading-tight">
              <span className={r.employees ? 'font-medium text-foreground' : 'text-faint-foreground'}>{r.employees}</span>
              {config.hasHierarchy && r.children ? (
                <span className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">{t('columns.subUnits', { count: r.children })}</span>
              ) : null}
            </div>
          );
        },
        meta: { label: t('columns.employees'), align: 'end', width: '7.5rem' },
      },
      {
        id: 'status',
        accessorFn: (r) => (r.is_active ? 0 : 1),
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('status')} />,
        cell: ({ row }) => <StatusBadge domain="record" status={row.original.is_active ? 'active' : 'inactive'} size="sm" />,
        meta: { label: tc('status'), width: '6rem' },
      },
      {
        id: 'description',
        accessorFn: (r) => localized(r, 'description', locale),
        header: () => tc('description'),
        enableSorting: false,
        cell: ({ row }) => {
          const d = localized(row.original, 'description', locale);
          return d ? <span className="line-clamp-2 max-w-72 text-meta text-muted-foreground">{d}</span> : <span className="text-faint-foreground">—</span>;
        },
        meta: { label: tc('description'), defaultHidden: true },
      },
      {
        id: 'updated_at',
        accessorFn: (r) => r.updated_at,
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('lastUpdated')} />,
        cell: ({ row }) => <span className="text-meta whitespace-nowrap text-muted-foreground">{df.date(row.original.updated_at)}</span>,
        meta: { label: tc('lastUpdated'), defaultHidden: true },
      },
      actionsColumn<MasterDataRow>(rowActions),
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowActions depends on the same inputs
  }, [canEdit, config.hasHierarchy, config.hasPlace, locale, t, tc, df, busyId, countryNames]);

  /* ─── Filters ─────────────────────────────────────────────────────────── */
  const filters = useMemo<FilterDef<MasterDataRow>[]>(() => {
    const defs: FilterDef<MasterDataRow>[] = [
      {
        key: 'status',
        title: tc('status'),
        options: [
          { value: 'active', label: tc('active'), icon: CircleCheckIcon, count: kpis.active },
          { value: 'inactive', label: tc('inactive'), icon: CircleOffIcon, count: kpis.inactive },
        ],
        accessor: (r) => (r.is_active ? 'active' : 'inactive'),
      },
    ];
    if (config.hasHierarchy) {
      defs.push({
        key: 'head',
        title: t('columns.head'),
        multiple: false,
        options: [
          { value: 'yes', label: t('filters.hasHead') },
          { value: 'no', label: t('filters.noHead'), icon: UserRoundXIcon },
        ],
        accessor: (r) => (r.head_employee_id ? 'yes' : 'no'),
      });
    }
    if (config.hasPlace) {
      const cities = Array.from(new Set(rows.map((r) => r.city).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, locale));
      if (cities.length > 1) {
        defs.push({
          key: 'city',
          title: t('fields.city'),
          options: cities.map((c) => ({ value: c, label: c, count: rows.filter((r) => r.city === c).length })),
          accessor: (r) => r.city,
        });
      }
    }
    return defs;
  }, [config.hasHierarchy, config.hasPlace, kpis.active, kpis.inactive, rows, locale, t, tc]);

  const searchText = (r: MasterDataRow) =>
    [r.code, r.name_ar, r.name_en, r.city, r.country, countryOf(r.country), r.parent?.name_ar, r.parent?.name_en, r.head?.name_ar, r.head?.name_en, r.head?.employee_number]
      .filter(Boolean)
      .join(' ');

  /* ─── Header actions ──────────────────────────────────────────────────── */
  const addButton = canEdit ? (
    <Button onClick={openCreate}>
      <PlusIcon />
      {te('add')}
    </Button>
  ) : (
    <SimpleTooltip content={t('readOnly')}>
      <span tabIndex={0}>
        <Button disabled>
          <PlusIcon />
          {te('add')}
        </Button>
      </span>
    </SimpleTooltip>
  );

  const Icon = config.icon;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        compact
        title={te('title')}
        description={te('description')}
        actions={
          <>
            {importHref ? (
              <Button asChild variant="outline">
                <Link href={importHref}>
                  <UploadIcon />
                  {tc('import')}
                </Link>
              </Button>
            ) : null}
            {addButton}
          </>
        }
      />

      <KpiGrid count={4}>
        <StatCard
          label={te('kpiTotal')}
          value={kpis.total}
          icon={Icon}
          hint={t('kpis.totalHint', { active: kpis.active, inactive: kpis.inactive })}
        />
        <StatCard label={t('kpis.assigned')} value={kpis.assigned} icon={UsersIcon} tone="info" hint={t('kpis.assignedHint')} />
        {kpis.unassigned !== null ? (
          <StatCard
            label={t('kpis.unassigned')}
            value={kpis.unassigned}
            icon={UserRoundXIcon}
            tone={kpis.unassigned > 0 ? 'warning' : 'success'}
            hint={te('unassignedHint')}
          />
        ) : (
          <StatCard label={t('kpis.inactive')} value={kpis.inactive} icon={CircleOffIcon} tone="neutral" hint={t('kpis.inactiveHint')} />
        )}
        {config.hasHierarchy ? (
          <StatCard
            label={t('kpis.withoutHead')}
            value={kpis.withoutHead}
            icon={UserRoundXIcon}
            tone={kpis.withoutHead > 0 ? 'secondary' : 'success'}
            hint={t('kpis.withoutHeadHint')}
          />
        ) : (
          <StatCard label={t('kpis.unused')} value={kpis.unused} icon={CircleOffIcon} tone="neutral" hint={t('kpis.unusedHint')} />
        )}
      </KpiGrid>

      <DataTable<MasterDataRow>
        tableId={`master-data-${entity}`}
        mode="client"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={openEdit}
        filters={filters}
        searchText={searchText}
        searchPlaceholder={te('searchPlaceholder')}
        exportDataset={canExport ? config.exportKey : undefined}
        defaultSort={{ id: 'code', desc: false }}
        enableRowSelection={canEdit}
        maxHeight="none"
        bulkActions={(selected, clear) => {
          const toActivate = selected.filter((r) => !r.is_active);
          const toDeactivateRows = selected.filter((r) => r.is_active);
          const activateButton = (
            <Button
              size="sm"
              variant="outline"
              loading={bulkPending}
              disabled={bulkPending || !toActivate.length}
              onClick={() =>
                startBulk(async () => {
                  if (await applyActive(toActivate.map((r) => r.id), true)) clear();
                })
              }
            >
              <PowerIcon />
              {tc('activate')}
            </Button>
          );
          const deactivateButton = (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkPending || !toDeactivateRows.length}
              onClick={() => {
                clearSelection.current = clear;
                setToDeactivate(toDeactivateRows);
              }}
            >
              <PowerOffIcon />
              {tc('deactivate')}
            </Button>
          );
          return (
            <>
              {toActivate.length ? (
                activateButton
              ) : (
                <SimpleTooltip content={t('bulk.allActive')}>
                  <span tabIndex={0}>{activateButton}</span>
                </SimpleTooltip>
              )}
              {toDeactivateRows.length ? (
                deactivateButton
              ) : (
                <SimpleTooltip content={t('bulk.allInactive')}>
                  <span tabIndex={0}>{deactivateButton}</span>
                </SimpleTooltip>
              )}
            </>
          );
        }}
        emptyState={{
          icon: Icon,
          title: te('emptyTitle'),
          description: te('emptyDescription'),
          action: canEdit ? (
            <>
              <Button size="sm" onClick={openCreate}>
                <PlusIcon />
                {te('add')}
              </Button>
              {importHref ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href={importHref}>
                    <UploadIcon />
                    {tc('import')}
                  </Link>
                </Button>
              ) : null}
            </>
          ) : undefined,
        }}
        renderMobileCard={(r) => (
          <MobileCard
            row={r}
            name={nameOf(r)}
            entity={entity}
            onOpen={() => openEdit(r)}
            actions={rowActions(r)}
            employeesLabel={t('columns.employeesCount', { count: r.employees })}
            secondary={
              config.hasHierarchy
                ? r.parent
                  ? localized(r.parent, 'name', locale)
                  : t('columns.topLevel')
                : config.hasPlace
                  ? [r.city, countryOf(r.country)].filter(Boolean).join(' · ') || null
                  : null
            }
          />
        )}
      />

      <MasterDataSheet
        entity={entity}
        open={sheet.open}
        row={sheet.row}
        departments={departments}
        countries={countries}
        readOnly={!canEdit}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
      />

      {/* Delete (unused rows only) */}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        variant="danger"
        title={t('confirm.deleteTitle', { name: toDelete ? nameOf(toDelete) : '' })}
        description={t('confirm.deleteDescription')}
        confirmLabel={tc('delete')}
        onConfirm={async () => {
          if (!toDelete) return;
          const result = await deleteMasterData({ entity, id: toDelete.id });
          if (!result.ok) {
            toast.error(resolve(result.error));
            return false;
          }
          toast.success(resolve(result.message));
          setToDelete(null);
        }}
      />

      {/* Deactivate (single or bulk) */}
      <ConfirmDialog
        open={Boolean(toDeactivate)}
        onOpenChange={(open) => {
          if (open) return;
          setToDeactivate(null);
          clearSelection.current = null;
        }}
        title={
          toDeactivate && toDeactivate.length > 1
            ? t('confirm.bulkDeactivateTitle', { count: toDeactivate.length })
            : t('confirm.deactivateTitle', { name: toDeactivate?.[0] ? nameOf(toDeactivate[0]) : '' })
        }
        description={t('confirm.deactivateDescription', {
          count: (toDeactivate ?? []).reduce((sum, r) => sum + r.employees, 0),
        })}
        confirmLabel={tc('deactivate')}
        onConfirm={async () => {
          if (!toDeactivate) return;
          const ok = await applyActive(
            toDeactivate.map((r) => r.id),
            false,
          );
          if (!ok) return false;
          clearSelection.current?.();
          clearSelection.current = null;
          setToDeactivate(null);
        }}
      />

      {/* In use → explain & offer deactivate */}
      <Dialog open={Boolean(inUse)} onOpenChange={(open) => !open && setInUse(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('inUse.title', { name: inUse ? nameOf(inUse) : '' })}</DialogTitle>
            <DialogDescription>{t('inUse.description')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5 rounded-lg border border-border bg-subtle px-4 py-3 text-sm">
              {inUse && inUse.allEmployees > 0 ? (
                <li className="flex items-center gap-2">
                  <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
                  {t('inUse.employees', { count: inUse.allEmployees })}
                </li>
              ) : null}
              {inUse && inUse.children > 0 ? (
                <li className="flex items-center gap-2">
                  <GitForkIcon className="size-4 text-muted-foreground" aria-hidden />
                  {t('inUse.children', { count: inUse.children })}
                </li>
              ) : null}
            </ul>
            <p className="text-meta text-muted-foreground">{inUse?.is_active ? t('inUse.hint') : t('inUse.alreadyInactive')}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInUse(null)}>
              {tc('close')}
            </Button>
            {inUse?.is_active ? (
              <Button
                onClick={() => {
                  const row = inUse;
                  setInUse(null);
                  setToDeactivate([row]);
                }}
              >
                <PowerOffIcon />
                {t('inUse.deactivate')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileCard({
  row,
  name,
  secondary,
  employeesLabel,
  onOpen,
  actions,
}: {
  row: MasterDataRow;
  name: string;
  entity: MasterEntity;
  secondary: string | null;
  employeesLabel: string;
  onOpen: () => void;
  actions: RowAction<MasterDataRow>[];
}) {
  const tc = useTranslations('common');
  const visible = actions.filter((a) => !a.hidden);
  return (
    <div className="flex items-start gap-3">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start outline-none focus-visible:underline">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">{name}</span>
          {row.code ? (
            <span dir="ltr" className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
              {row.code}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <StatusBadge domain="record" status={row.is_active ? 'active' : 'inactive'} size="sm" />
          <span>{employeesLabel}</span>
          {secondary ? <span className="truncate">· {secondary}</span> : null}
        </div>
      </button>
      {visible.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={tc('moreActions')}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {visible.map((a, i) => {
              const ItemIcon = a.icon;
              return [
                a.separatorBefore && i > 0 ? <DropdownMenuSeparator key={`s${i}`} /> : null,
                <DropdownMenuItem key={i} variant={a.variant} disabled={a.disabled} onSelect={() => a.onSelect?.(row)}>
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
