'use client';

import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon, Loader2Icon, SheetIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useExportDownload } from './use-export-download';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

/** Builds `/api/export/<dataset>?format=<fmt>&<current filters>` (pagination stripped). */
export function exportHref(dataset: string, format: ExportFormat, queryString: string) {
  const params = new URLSearchParams(queryString);
  params.delete('page');
  params.delete('pageSize');
  params.set('format', format);
  return `/api/export/${encodeURIComponent(dataset)}?${params.toString()}`;
}

export type DataTableExportMenuProps = {
  dataset: string;
  queryString: string;
  formats?: ExportFormat[];
};

/** Export dropdown (Excel / CSV / PDF) applying the table's current search + filters, with progress toasts. */
export function DataTableExportMenu({ dataset, queryString, formats = ['xlsx', 'csv', 'pdf'] }: DataTableExportMenuProps) {
  const t = useTranslations('common.table');
  const { download, pending } = useExportDownload();
  const items = {
    xlsx: { label: t('exportExcel'), icon: FileSpreadsheetIcon },
    csv: { label: t('exportCsv'), icon: SheetIcon },
    pdf: { label: t('exportPdf'), icon: FileTextIcon },
  } as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="active:scale-100" aria-busy={pending ? true : undefined}>
          {pending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          <span className="hidden sm:inline">{t('export')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">{t('exportHint')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {formats.map((f) => {
          const { label, icon: Icon } = items[f];
          return (
            <DropdownMenuItem key={f} disabled={pending !== null} onSelect={() => void download(exportHref(dataset, f, queryString), f)}>
              {pending === f ? <Loader2Icon className="animate-spin" /> : <Icon />}
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
