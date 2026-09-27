'use client';

import { ChevronDownIcon, DownloadIcon, FileSpreadsheetIcon, FileTextIcon, SheetIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useReportT } from './format';
import { useExportDownload } from './use-export-download';

const FORMATS = [
  { format: 'xlsx', labelKey: 'common.table.exportExcel', icon: FileSpreadsheetIcon },
  { format: 'csv', labelKey: 'common.table.exportCsv', icon: SheetIcon },
  { format: 'pdf', labelKey: 'common.table.exportPdf', icon: FileTextIcon },
] as const;

export type ReportExportMenuProps = {
  /** Export URL for a format. */
  href: (format: string) => string;
  /** Why exporting is not possible right now (disabled button + tooltip), or null. */
  disabledReason: string | null;
  /** Menu caption (what the export applies). */
  hint: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'outline';
};

/** Export button (Excel / CSV / PDF) with generation feedback; disabled with a reason when not allowed. */
export function ReportExportMenu({ href, disabledReason, hint, size = 'md', variant = 'default' }: ReportExportMenuProps) {
  const t = useReportT();
  const { download, pending } = useExportDownload();

  if (disabledReason) {
    return (
      <SimpleTooltip content={disabledReason}>
        <span
          tabIndex={0}
          aria-label={`${t('reports.view.export')}: ${disabledReason}`}
          className="inline-flex rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <Button variant="outline" size={size} disabled tabIndex={-1}>
            <DownloadIcon />
            {t('reports.view.export')}
          </Button>
        </span>
      </SimpleTooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} loading={Boolean(pending)}>
          {pending ? null : <DownloadIcon />}
          {t('reports.view.export')}
          <ChevronDownIcon className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal text-muted-foreground">{hint}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map(({ format, labelKey, icon: Icon }) => (
          <DropdownMenuItem key={format} disabled={Boolean(pending)} onSelect={() => void download(href(format), format)}>
            <Icon />
            {t(labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
