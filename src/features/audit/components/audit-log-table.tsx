'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ActivityIcon, CalendarIcon, ExternalLinkIcon, EyeIcon, LayersIcon, ScrollTextIcon, ShapesIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef, type FilterOption } from '@/components/data-table';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { Badge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/dates';
import { formatDateTime } from '@/lib/i18n/date-format';
import { cn } from '@/lib/utils';
import type { AuditEventView } from '../types';
import { AuditDetailsSheet, TONE_BADGE } from './audit-details-sheet';
import { auditIcon, auditToneClass } from './audit-visuals';

export type AuditFilterOptions = {
  categories: FilterOption[];
  actions: FilterOption[];
  entities: FilterOption[];
  actors: FilterOption[];
};

type Props = {
  rows: AuditEventView[];
  total: number;
  options: AuditFilterOptions;
  /** Event opened from `?event=<id>` (may be outside the current page). */
  initialEvent: AuditEventView | null;
  canExport: boolean;
  nowIso: string;
};

function setEventParam(id: number | null) {
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete('event');
  else url.searchParams.set('event', String(id));
  window.history.replaceState(window.history.state, '', url);
}

/** Read-only audit trail: dense server-side table, grouped filters, details drawer, export. */
export function AuditLogTable({ rows, total, options, initialEvent, canExport, nowIso }: Props) {
  const t = useTranslations('audit');
  const locale = useLocale();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [selected, setSelected] = useState<AuditEventView | null>(initialEvent);

  useEffect(() => {
    // A new deep link (e.g. navigating from the dashboard) re-opens the drawer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialEvent) setSelected(initialEvent);
  }, [initialEvent]);

  const open = useCallback((row: AuditEventView) => {
    setSelected(row);
    setEventParam(row.id);
  }, []);
  const onOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setSelected(null);
      setEventParam(null);
    }
  }, []);

  const columns = useMemo<ColumnDef<AuditEventView>[]>(
    () => [
      {
        id: 'created_at',
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.time')} />,
        cell: ({ row }) => (
          <div className="leading-tight whitespace-nowrap">
            <div className="numeric text-[0.8125rem] text-foreground">{formatDateTime(row.original.createdAt, locale)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{formatRelative(row.original.createdAt, locale, now)}</div>
          </div>
        ),
        meta: { label: t('columns.time'), width: '10.5rem' },
      },
      {
        id: 'actor_email',
        accessorFn: (r) => r.actor.email ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.actor')} />,
        cell: ({ row }) => {
          const a = row.original.actor;
          if (!a.id && !a.email) {
            return (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted">
                  <UserRoundIcon className="size-3.5" aria-hidden />
                </span>
                {t('system')}
              </span>
            );
          }
          return (
            <div className="flex min-w-0 items-center gap-2">
              <EmployeeAvatar name={a.name || a.email || '?'} seed={a.id ?? a.email ?? ''} size="xs" />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[0.8125rem] font-medium text-foreground">{a.name || a.email}</div>
                {a.name && a.email ? (
                  <bdi className="block truncate text-xs text-muted-foreground" dir="ltr">
                    {a.email}
                  </bdi>
                ) : null}
              </div>
            </div>
          );
        },
        meta: { label: t('columns.actor'), width: '13rem' },
      },
      {
        id: 'action',
        accessorKey: 'action',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.action')} />,
        cell: ({ row }) => {
          const Icon = auditIcon(row.original.action);
          return (
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', auditToneClass(row.original.action))}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <Badge variant={TONE_BADGE[row.original.tone]} size="sm" className="max-w-full truncate" title={row.original.actionLabel}>
                <span className="truncate">{row.original.actionLabel}</span>
              </Badge>
            </div>
          );
        },
        meta: { label: t('columns.action'), width: '13rem' },
      },
      {
        id: 'entity_type',
        accessorKey: 'entityType',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.entity')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[0.8125rem] text-foreground">{r.entityLabel || '—'}</div>
              {r.href ? (
                <Link
                  href={r.href}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  <span className="truncate">{t('openRecord')}</span>
                  <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
                </Link>
              ) : r.entityId ? (
                <code className="mt-0.5 block truncate font-mono text-2xs text-faint-foreground" dir="ltr">
                  {r.entityId}
                </code>
              ) : null}
            </div>
          );
        },
        meta: { label: t('columns.entity'), width: '10rem' },
      },
      {
        id: 'summary',
        accessorKey: 'summary',
        enableSorting: false,
        header: () => t('columns.summary'),
        cell: ({ row }) =>
          row.original.summary ? (
            <p className="line-clamp-2 min-w-48 max-w-[36rem] text-[0.8125rem] break-words whitespace-normal text-foreground/90" title={row.original.summary}>
              <bdi>{row.original.summary}</bdi>
            </p>
          ) : (
            <span className="text-faint-foreground">—</span>
          ),
        // Flexible: takes the remaining width (no horizontal scroll at 1440px with the sidebar open).
        meta: { label: t('columns.summary') },
      },
      {
        id: 'ip',
        accessorKey: 'ip',
        enableSorting: false,
        header: () => t('columns.ip'),
        cell: ({ row }) => (
          <code className="font-mono text-xs text-muted-foreground" dir="ltr">
            {row.original.ip ?? '—'}
          </code>
        ),
        meta: { label: t('columns.ip'), defaultHidden: true, width: '8rem' },
      },
      actionsColumn<AuditEventView>((r) => [
        { label: t('viewDetails'), icon: EyeIcon, onSelect: open },
        { label: t('openRecord'), icon: ExternalLinkIcon, href: r.href ?? undefined, hidden: !r.href },
      ]),
    ],
    [t, locale, now, open],
  );

  const filters = useMemo<FilterDef<AuditEventView>[]>(
    () => [
      { type: 'dateRange', key: 'created', title: t('filters.date') },
      { key: 'category', title: t('filters.category'), options: options.categories, icon: LayersIcon },
      { key: 'action', title: t('filters.action'), options: options.actions, icon: ActivityIcon },
      { key: 'actor', title: t('filters.actor'), options: options.actors, icon: UserRoundIcon },
    ],
    [t, options],
  );
  const moreFilters = useMemo<FilterDef<AuditEventView>[]>(
    () => [{ key: 'entity', title: t('filters.entity'), options: options.entities, icon: ShapesIcon }],
    [t, options],
  );

  return (
    <>
      <DataTable
        tableId="audit-logs"
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => String(r.id)}
        onRowClick={open}
        filters={filters}
        moreFilters={moreFilters}
        searchable
        searchPlaceholder={t('searchPlaceholder')}
        exportDataset={canExport ? 'audit' : undefined}
        defaultSort={{ id: 'created_at', desc: true }}
        defaultPageSize={25}
        density="compact"
        emptyState={{ icon: ScrollTextIcon, title: t('empty.title'), description: t('empty.description') }}
        renderMobileCard={(r) => {
          const Icon = auditIcon(r.action);
          return (
            <div className="flex items-start gap-3">
              <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md', auditToneClass(r.action))}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{r.actionLabel}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(r.createdAt, locale, now)}</span>
                </div>
                {r.summary ? (
                  <p className="mt-0.5 line-clamp-2 text-meta break-words text-foreground/80">
                    <bdi>{r.summary}</bdi>
                  </p>
                ) : null}
                <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <CalendarIcon className="size-3 shrink-0" aria-hidden />
                  <span className="numeric">{formatDateTime(r.createdAt, locale)}</span>
                  <span aria-hidden>·</span>
                  <bdi className="truncate">{r.actor.name || r.actor.email || t('system')}</bdi>
                </div>
              </div>
            </div>
          );
        }}
      />
      <AuditDetailsSheet event={selected} onOpenChange={onOpenChange} />
    </>
  );
}
