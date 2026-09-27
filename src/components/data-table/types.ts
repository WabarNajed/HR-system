import type { RowData } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Human label (translated) — used by the column-visibility menu and mobile layouts. */
    label?: string;
    /** Cell/header alignment (logical). Numbers usually `end`. */
    align?: 'start' | 'center' | 'end';
    headerClassName?: string;
    cellClassName?: string;
    /** Hidden until the user enables it in "Columns". */
    defaultHidden?: boolean;
    /** Keep the column pinned at the inline start on horizontal scroll. */
    sticky?: boolean;
    /** Fixed width (CSS length), e.g. '12rem'. */
    width?: string;
  }
}

export type FilterOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Optional facet count shown next to the option. */
  count?: number;
};

export type SelectFilterDef<TData = unknown> = {
  type?: 'select';
  /** URL key (server mode) — comma-separated values. */
  key: string;
  title: string;
  options: FilterOption[];
  /** Allow multiple values (default true). */
  multiple?: boolean;
  icon?: LucideIcon;
  /** Client mode: value(s) of the row for this filter (defaults to `row[key]`). */
  accessor?: (row: TData) => string | string[] | null | undefined;
};

export type DateRangeFilterDef<TData = unknown> = {
  type: 'dateRange';
  /** URL keys become `<key>From` and `<key>To` (ISO yyyy-MM-dd). */
  key: string;
  title: string;
  /** Client mode: ISO date of the row for this filter (defaults to `row[key]`). */
  accessor?: (row: TData) => string | null | undefined;
};

export type FilterDef<TData = unknown> = SelectFilterDef<TData> | DateRangeFilterDef<TData>;

export type SortState = { id: string; desc: boolean } | null;

export type TableQueryState = {
  page: number;
  pageSize: number;
  sort: SortState;
  q: string;
  /** Filter values keyed by URL key (date ranges use `<key>From` / `<key>To`). */
  filters: Record<string, string[]>;
};

export type TableQueryPatch = Partial<Omit<TableQueryState, 'filters'>> & {
  filters?: Record<string, string[] | null>;
};

export type RowAction<TData> = {
  label: string;
  icon?: LucideIcon;
  /** Navigate to a URL. */
  href?: string;
  /** Or run a callback. */
  onSelect?: (row: TData) => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  /** Tooltip-like reason shown when disabled (rendered as the item's title). */
  disabledReason?: string;
  hidden?: boolean;
  separatorBefore?: boolean;
};

export type EmptyStateConfig = {
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};
