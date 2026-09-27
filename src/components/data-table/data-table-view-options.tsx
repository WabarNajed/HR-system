'use client';

import type { Table } from '@tanstack/react-table';
import { Settings2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/components/ui/tooltip';

/** Column visibility menu (persisted per tableId by DataTable). */
export function DataTableViewOptions<TData>({ table, onReset }: { table: Table<TData>; onReset: () => void }) {
  const t = useTranslations('common.table');
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());
  if (!columns.length) return null;
  return (
    <DropdownMenu>
      <SimpleTooltip content={t('toggleColumns')}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="active:scale-100">
            <Settings2Icon />
            <span className="hidden sm:inline">{t('columns')}</span>
          </Button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t('toggleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(!!value)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="truncate">{column.columnDef.meta?.label ?? column.id}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset}>{t('resetColumns')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
