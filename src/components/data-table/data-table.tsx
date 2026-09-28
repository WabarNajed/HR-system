'use client';

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table';
import { SearchXIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DataTableExportMenu, type ExportFormat } from './data-table-export-menu';
import { DataTablePagination } from './data-table-pagination';
import { DataTableSkeleton } from './data-table-skeleton';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTableViewOptions } from './data-table-view-options';
import type { EmptyStateConfig, FilterDef, SortState } from './types';
import { useLocalTableState, useUrlTableState, type TableStateApi } from './use-table-state';

export type DataTableProps<TData> = {
  /** Stable id — column visibility is persisted per id in localStorage. */
  tableId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  data: TData[];
  /**
   * `server` (default): page/sort/search/filters live in the URL; the server page re-renders
   * with `parseListParams()` and passes the current page of rows + `total`.
   * `client`: small datasets fully loaded; everything happens in memory.
   */
  mode?: 'server' | 'client';
  /** Server mode: total matching rows (for pagination). */
  total?: number;
  getRowId?: (row: TData, index: number) => string;
  /** Row click / Enter navigates here (keyboard accessible). */
  rowHref?: (row: TData) => string | null | undefined;
  onRowClick?: (row: TData) => void;
  /** Toolbar filters (faceted select or date range). */
  filters?: FilterDef<TData>[];
  /** Extra filters shown in the "More filters" sheet. */
  moreFilters?: FilterDef<TData>[];
  /** Custom content appended inside the "More filters" sheet. */
  moreFiltersSlot?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Client mode: text used for search (defaults to all primitive fields of the row). */
  searchText?: (row: TData) => string;
  /** Shows the export menu → `/api/export/<dataset>?format=…&<current params>`. */
  exportDataset?: string;
  exportFormats?: ExportFormat[];
  /** Custom toolbar actions (logical end, before Columns/Export). */
  toolbarActions?: ReactNode;
  /** Hide the whole toolbar. */
  toolbar?: boolean;
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  /** Bar shown when rows are selected. */
  bulkActions?: (rows: TData[], clearSelection: () => void) => ReactNode;
  defaultSort?: SortState;
  defaultPageSize?: number;
  pageSizes?: number[];
  /** "No data yet" state (no search/filters active). */
  emptyState?: EmptyStateConfig;
  /** Initial loading (client fetch) → skeleton. */
  loading?: boolean;
  /** < md: render rows as cards instead of the table. */
  renderMobileCard?: (row: TData) => ReactNode;
  density?: 'default' | 'compact';
  /** Pin the first data column during horizontal scroll (default true). */
  stickyFirstColumn?: boolean;
  /**
   * Max height of the scroll area (the header sticks inside it). Default `'none'`: the table grows with the
   * page and its header sticks below the app header while the page scrolls (no nested vertical scrolling).
   */
  maxHeight?: string;
  /** Show the pagination footer (default true). */
  pagination?: boolean;
  className?: string;
};

/** DataTable — picks the URL-driven (server) or in-memory (client) state engine. */
export function DataTable<TData>(props: DataTableProps<TData>) {
  return props.mode === 'client' ? <ClientDataTable {...props} /> : <ServerDataTable {...props} />;
}

function ServerDataTable<TData>(props: DataTableProps<TData>) {
  const filterDefs = useMemo(() => [...(props.filters ?? []), ...(props.moreFilters ?? [])], [props.filters, props.moreFilters]);
  const api = useUrlTableState(filterDefs as FilterDef<unknown>[], { pageSize: props.defaultPageSize, sort: props.defaultSort });
  return <DataTableView {...props} api={api} rows={props.data} total={props.total ?? props.data.length} serverSide />;
}

function defaultSearchText(row: unknown): string {
  if (!row || typeof row !== 'object') return String(row ?? '');
  return Object.values(row as Record<string, unknown>)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ');
}

function ClientDataTable<TData>(props: DataTableProps<TData>) {
  const api = useLocalTableState({ pageSize: props.defaultPageSize, sort: props.defaultSort });
  const { state } = api;
  const { data, filters, moreFilters, searchText } = props;

  const rows = useMemo(() => {
    const defs = [...(filters ?? []), ...(moreFilters ?? [])];
    const q = state.q.trim().toLowerCase();
    return data.filter((row) => {
      if (q && !(searchText ?? defaultSearchText)(row).toLowerCase().includes(q)) return false;
      for (const def of defs) {
        if (def.type === 'dateRange') {
          const from = state.filters[`${def.key}From`]?.[0];
          const to = state.filters[`${def.key}To`]?.[0];
          if (!from && !to) continue;
          const raw = def.accessor ? def.accessor(row) : (row as Record<string, unknown>)[def.key];
          const value = typeof raw === 'string' ? raw.slice(0, 10) : null;
          if (!value) return false;
          if (from && value < from) return false;
          if (to && value > to) return false;
        } else {
          const wanted = state.filters[def.key];
          if (!wanted?.length) continue;
          const raw = def.accessor ? def.accessor(row) : (row as Record<string, unknown>)[def.key];
          const values = Array.isArray(raw) ? raw.map(String) : raw === null || raw === undefined ? [] : [String(raw)];
          if (!values.some((v) => wanted.includes(v))) return false;
        }
      }
      return true;
    });
  }, [data, filters, moreFilters, searchText, state.q, state.filters]);

  return <DataTableView {...props} api={api} rows={rows} total={rows.length} serverSide={false} />;
}

type ViewProps<TData> = DataTableProps<TData> & {
  api: TableStateApi;
  rows: TData[];
  total: number;
  serverSide: boolean;
};

const INTERACTIVE = 'a,button,input,select,textarea,label,[role=checkbox],[role=menuitem],[role=switch],[data-no-row-click]';

function DataTableView<TData>({
  tableId,
  columns,
  api,
  rows,
  total,
  serverSide,
  getRowId,
  rowHref,
  onRowClick,
  filters = [],
  moreFilters = [],
  moreFiltersSlot,
  searchable = true,
  searchPlaceholder,
  exportDataset,
  exportFormats,
  toolbarActions,
  toolbar = true,
  enableRowSelection,
  bulkActions,
  pageSizes,
  emptyState,
  loading,
  renderMobileCard,
  density = 'default',
  stickyFirstColumn = true,
  maxHeight,
  pagination = true,
  className,
}: ViewProps<TData>) {
  const t = useTranslations('common');
  const router = useRouter();
  const { state, setState, isPending, queryString } = api;
  const storageKey = `dt:${tableId}:columns`;

  /* Column visibility (persisted; hydrated after mount to avoid SSR mismatch) */
  const defaultVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const c of columns) {
      const id = c.id ?? ('accessorKey' in c ? String(c.accessorKey) : undefined);
      if (id && c.meta?.defaultHidden) v[id] = false;
    }
    return v;
  }, [columns]);
  /* Low-priority columns (`meta.defaultHiddenBelow`) start hidden on narrower viewports — client-only. */
  const hiddenBelow = useMemo(() => {
    const list: [string, number][] = [];
    for (const c of columns) {
      const id = c.id ?? ('accessorKey' in c ? String(c.accessorKey) : undefined);
      if (id && c.meta?.defaultHiddenBelow) list.push([id, c.meta.defaultHiddenBelow]);
    }
    return list;
  }, [columns]);
  const clientDefaults = useCallback((): VisibilityState => {
    const v = { ...defaultVisibility };
    for (const [id, below] of hiddenBelow) if (window.innerWidth < below) v[id] = false;
    return v;
  }, [defaultVisibility, hiddenBelow]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(defaultVisibility);
  useEffect(() => {
    let saved: VisibilityState = {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw) as VisibilityState;
    } catch {
      /* storage unavailable — keep defaults */
    }
    if (hiddenBelow.length || Object.keys(saved).length) setColumnVisibility({ ...clientDefaults(), ...saved });
    // Keyed by content, not identity: callers may build `columns` inline on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, JSON.stringify(defaultVisibility), JSON.stringify(hiddenBelow)]);
  const onVisibilityChange = useCallback(
    (updater: Updater<VisibilityState>) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );
  const resetVisibility = useCallback(() => {
    setColumnVisibility(clientDefaults());
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [clientDefaults, storageKey]);

  /* Selection resets when the visible data set changes */
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // Keyed by row ids, not array identity, so a parent re-render with the same rows keeps the selection.
  const rowKey = rows.map((row, index) => (getRowId ? getRowId(row, index) : String(index))).join('|');
  useEffect(() => setRowSelection({}), [rowKey]);

  const sorting = useMemo<SortingState>(() => (state.sort ? [{ id: state.sort.id, desc: state.sort.desc }] : []), [state.sort]);
  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setState({ sort: next[0] ? { id: next[0].id, desc: next[0].desc } : null });
    },
    [sorting, setState],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable functions by design.
  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      pagination: { pageIndex: state.page - 1, pageSize: state.pageSize },
    },
    enableRowSelection: enableRowSelection ?? false,
    onRowSelectionChange: setRowSelection,
    onSortingChange,
    onColumnVisibilityChange: onVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    ...(serverSide
      ? { manualPagination: true, manualSorting: true, manualFiltering: true, rowCount: total }
      : { getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), autoResetPageIndex: false }),
    enableSortingRemoval: true,
  });

  // Client mode: clamp page when filters shrink the result set.
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  useEffect(() => {
    if (!serverSide && state.page > pageCount) setState({ page: pageCount });
  }, [serverSide, state.page, pageCount, setState]);

  const visibleRows = table.getRowModel().rows;
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const isFiltered = Boolean(state.q) || Object.keys(state.filters).length > 0;

  const clearFilters = () => {
    const patch: Record<string, null> = {};
    for (const key of Object.keys(state.filters)) patch[key] = null;
    setState({ q: '', filters: patch });
  };

  const handleRowActivate = (row: TData, e: MouseEvent | KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    const href = rowHref?.(row);
    if (href) {
      if ('metaKey' in e && (e.metaKey || e.ctrlKey)) window.open(href, '_blank', 'noopener');
      else router.push(href);
    } else onRowClick?.(row);
  };
  const clickable = Boolean(rowHref || onRowClick);

  /* Sticky first data column (and the selection column before it) */
  const leafColumns = table.getVisibleLeafColumns();
  const firstDataIndex = leafColumns.findIndex((c) => c.id !== 'select');
  const stickyIds = new Set<string>();
  if (stickyFirstColumn && firstDataIndex >= 0) {
    for (let i = 0; i <= firstDataIndex; i++) stickyIds.add(leafColumns[i]!.id);
  }
  for (const c of leafColumns) if (c.columnDef.meta?.sticky) stickyIds.add(c.id);
  const hasSelect = leafColumns[0]?.id === 'select';
  const startEdgeId = stickyIds.size ? leafColumns.filter((c) => stickyIds.has(c.id)).at(-1)?.id : undefined;
  /* Trailing row-actions column stays reachable at the inline end while the table scrolls sideways. */
  const lastColumn = leafColumns.at(-1);
  const endStickyId =
    lastColumn &&
    !stickyIds.has(lastColumn.id) &&
    (lastColumn.columnDef.meta?.stickyEnd ?? (lastColumn.id === 'actions' || (!lastColumn.accessorFn && !lastColumn.getCanHide())))
      ? lastColumn.id
      : undefined;
  const stickyClass = (id: string) =>
    stickyIds.has(id)
      ? cn('sticky z-[1] bg-inherit', id === 'select' || !hasSelect ? 'start-0' : 'start-11')
      : id === endStickyId
        ? // From md only: on phones the pinned first column already takes most of the width.
          'md:sticky md:end-0 md:z-[1] md:bg-inherit'
        : '';
  const stickyEdge = (id: string) => (id === startEdgeId ? 'start' : id === endStickyId ? 'end' : undefined);

  const growWithPage = !maxHeight || maxHeight === 'none';
  const scrollerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  useScrollEdges(scrollerRef);
  usePageStickyHeader(scrollerRef, theadRef, growWithPage);

  const alignClass = (align?: 'start' | 'center' | 'end') =>
    align === 'end' ? 'text-end' : align === 'center' ? 'text-center' : 'text-start';

  const rowHeight = density === 'compact' ? 'h-10' : 'h-12';

  const endControls = (
    <>
      {toolbarActions}
      <DataTableViewOptions table={table} onReset={resetVisibility} />
      {exportDataset ? <DataTableExportMenu dataset={exportDataset} queryString={queryString} formats={exportFormats} /> : null}
    </>
  );

  const selectionBar =
    bulkActions && selectedRows.length ? (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/25 bg-primary-soft/60 px-3 py-1.5">
        <span className="text-meta font-medium text-primary-soft-foreground">
          {t('table.selectedRows', { count: selectedRows.length })}
        </span>
        <div className="flex flex-wrap items-center gap-2">{bulkActions(selectedRows, () => setRowSelection({}))}</div>
        <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setRowSelection({})}>
          {t('table.clearSelection')}
        </Button>
      </div>
    ) : undefined;

  if (loading) {
    return <DataTableSkeleton columns={Math.min(columns.length, 7)} rows={8} toolbar={toolbar} className={className} />;
  }

  const empty =
    visibleRows.length === 0 ? (
      isFiltered ? (
        <EmptyState
          icon={SearchXIcon}
          tone="neutral"
          title={t('table.noResultsTitle')}
          description={t('table.noResultsDescription')}
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t('clearFilters')}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={emptyState?.icon}
          title={emptyState?.title ?? t('table.emptyTitle')}
          description={emptyState?.description ?? t('table.emptyDescription')}
          action={emptyState?.action}
        />
      )
    ) : null;

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)} data-slot="data-table" data-pending={isPending || undefined}>
      {toolbar ? (
        <DataTableToolbar
          state={state}
          setState={setState}
          isPending={isPending}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          filters={filters as FilterDef<unknown>[]}
          moreFilters={moreFilters as FilterDef<unknown>[]}
          moreFiltersSlot={moreFiltersSlot}
          end={endControls}
          selectionBar={selectionBar}
        />
      ) : null}

      <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-card">
        {/* Pending indicator: rows stay visible (dimmed) while the next page loads */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden transition-opacity duration-200',
            isPending ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="h-full w-full origin-[0%_50%] animate-progress-indeterminate bg-primary rtl:origin-[100%_50%]" />
        </div>

        {renderMobileCard && visibleRows.length ? (
          <ul className={cn('divide-y divide-border md:hidden', isPending && 'opacity-60 transition-opacity')}>
            {visibleRows.map((row) => {
              const href = rowHref?.(row.original);
              return (
                <li key={row.id}>
                  {href ? (
                    <Link href={href} prefetch={false} className="block px-4 py-3 transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none">
                      {renderMobileCard(row.original)}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{renderMobileCard(row.original)}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div
          ref={scrollerRef}
          data-slot="data-table-scroller"
          className={cn(
            'relative w-full overflow-auto',
            renderMobileCard && visibleRows.length ? 'hidden md:block' : '',
            !growWithPage && 'md:max-h-(--dt-max-h)',
          )}
          style={growWithPage ? undefined : { ['--dt-max-h' as string]: maxHeight }}
        >
          <table className="w-full caption-bottom border-separate border-spacing-0 text-sm numeric">
            <thead ref={theadRef} className={cn('z-10 bg-subtle', growWithPage ? 'relative will-change-transform' : 'sticky top-0')}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="bg-subtle">
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        data-sticky-edge={stickyEdge(header.column.id)}
                        style={meta?.width ? { width: meta.width, minWidth: meta.width } : undefined}
                        aria-sort={
                          header.column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : header.column.getIsSorted() === 'desc'
                              ? 'descending'
                              : undefined
                        }
                        className={cn(
                          'h-10 border-b border-border px-3 align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground first:ps-4 last:pe-4',
                          alignClass(meta?.align),
                          stickyClass(header.column.id),
                          meta?.headerClassName,
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className={cn('transition-opacity duration-150', isPending && 'opacity-55')}>
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? (e) => handleRowActivate(row.original, e) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter') handleRowActivate(row.original, e);
                        }
                      : undefined
                  }
                  onMouseEnter={rowHref ? () => {
                    const href = rowHref(row.original);
                    if (href) router.prefetch(href);
                  } : undefined}
                  className={cn(
                    'group/row bg-card transition-colors hover:bg-subtle data-[state=selected]:bg-primary-soft/50',
                    clickable && 'cursor-pointer focus-visible:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <td
                        key={cell.id}
                        data-sticky-edge={stickyEdge(cell.column.id)}
                        className={cn(
                          rowHeight,
                          'border-b border-border px-3 py-1.5 align-middle whitespace-nowrap text-foreground first:ps-4 last:pe-4 group-last/row:border-b-0',
                          alignClass(meta?.align),
                          stickyClass(cell.column.id),
                          meta?.cellClassName,
                        )}
                      >
                        {meta?.maxWidth ? (
                          <div className="min-w-0" style={{ maxWidth: meta.maxWidth }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {empty ? <div className="border-t border-border">{empty}</div> : null}

        {pagination && (total > 0 || state.page > 1) ? (
          <div className="border-t border-border bg-card">
            <DataTablePagination
              page={state.page}
              pageSize={state.pageSize}
              total={total}
              pageSizes={pageSizes}
              disabled={isPending}
              onPageChange={(page) => setState({ page })}
              onPageSizeChange={(pageSize) => setState({ pageSize, page: 1 })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Marks the scroller with `data-overflow-start` / `data-overflow-end` while content is hidden on that side,
 * so the pinned columns cast an edge shadow (see `[data-sticky-edge]` in globals.css) — the scroll hint.
 */
function useScrollEdges(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = Math.abs(el.scrollLeft); // RTL scrollLeft runs 0 → negative
      const hiddenStart = offset > 1;
      const hiddenEnd = offset + el.clientWidth < el.scrollWidth - 1;
      el.toggleAttribute('data-overflow-start', hiddenStart);
      el.toggleAttribute('data-overflow-end', hiddenEnd);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/**
 * Page-level sticky header for tables that grow with the page: the scroller must clip horizontally, which
 * also makes it the sticky containing block, so the header is translated to stay under the app header.
 */
function usePageStickyHeader(
  scrollerRef: RefObject<HTMLDivElement | null>,
  theadRef: RefObject<HTMLTableSectionElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const scroller = scrollerRef.current;
    const thead = theadRef.current;
    if (!enabled || !scroller || !thead) return;
    // Only for tables in the page flow (dialogs/sheets scroll on their own).
    if (scroller.closest('[role=dialog],[role=alertdialog]')) return;
    let frame = 0;
    let applied = 0;
    const update = () => {
      frame = 0;
      const header = document.querySelector<HTMLElement>('[data-slot=app-header]');
      const top = header ? header.getBoundingClientRect().bottom : 0;
      const rect = scroller.getBoundingClientRect();
      const max = Math.max(0, rect.height - thead.offsetHeight - 48);
      const offset = Math.min(Math.max(0, top - rect.top), max);
      if (offset !== applied) {
        applied = offset;
        thead.style.transform = offset ? `translateY(${offset}px)` : '';
        thead.toggleAttribute('data-stuck', offset > 0);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      thead.style.transform = '';
      thead.removeAttribute('data-stuck');
    };
  }, [scrollerRef, theadRef, enabled]);
}
