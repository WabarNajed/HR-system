'use client';

import type { ColumnDef, Row } from '@tanstack/react-table';
import { MoreHorizontalIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RowAction } from './types';

function SelectAllHeader<TData>({ table }: { table: import('@tanstack/react-table').Table<TData> }) {
  const t = useTranslations('common.table');
  return (
    <Checkbox
      checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label={t('selectAllRows')}
    />
  );
}

function SelectRowCell<TData>({ row }: { row: Row<TData> }) {
  const t = useTranslations('common.table');
  return (
    <Checkbox
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      aria-label={t('selectRow')}
      data-no-row-click
    />
  );
}

/** Checkbox column (enable `enableRowSelection` on the DataTable). */
export function selectColumn<TData>(): ColumnDef<TData> {
  return {
    id: 'select',
    header: ({ table }) => <SelectAllHeader table={table} />,
    cell: ({ row }) => <SelectRowCell row={row} />,
    enableSorting: false,
    enableHiding: false,
    meta: { width: '2.75rem', headerClassName: 'pe-0', cellClassName: 'pe-0' },
  };
}

function RowActionsMenu<TData>({ row, actions }: { row: TData; actions: RowAction<TData>[] }) {
  const t = useTranslations('common.table');
  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('rowActions')} data-no-row-click className="data-[state=open]:bg-accent">
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {visible.map((action, i) => {
          const Icon = action.icon;
          const item = action.href ? (
            <DropdownMenuItem key={i} asChild variant={action.variant} disabled={action.disabled} title={action.disabled ? action.disabledReason : undefined}>
              <Link href={action.href}>
                {Icon ? <Icon /> : null}
                {action.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={i}
              variant={action.variant}
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : undefined}
              onSelect={() => action.onSelect?.(row)}
            >
              {Icon ? <Icon /> : null}
              {action.label}
            </DropdownMenuItem>
          );
          return action.separatorBefore && i > 0 ? [<DropdownMenuSeparator key={`s${i}`} />, item] : item;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Trailing "⋯" row-actions column. `actions(row)` returns the menu items for that row. */
export function actionsColumn<TData>(actions: (row: TData) => RowAction<TData>[]): ColumnDef<TData> {
  return {
    id: 'actions',
    header: () => null,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <RowActionsMenu row={row.original} actions={actions(row.original)} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { width: '3.5rem', align: 'end', stickyEnd: true },
  };
}
