'use client';

import type { Column } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { DataTableColumnHeader } from '@/components/data-table';

/**
 * Sortable header that never truncates its (short) title: the shared header truncates by default,
 * which lets narrow numeric columns collapse to "…" in Arabic.
 */
export function SortHeader<TData, TValue>({ column, title }: { column: Column<TData, TValue>; title: ReactNode }) {
  return <DataTableColumnHeader column={column} title={title} className="[&>span:first-child]:overflow-visible" />;
}
