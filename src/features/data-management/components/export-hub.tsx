import { FileDownIcon, FileSpreadsheetIcon, FileTextIcon, SheetIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

export type ExportHubDataset = { key: string; title: string; formats: readonly ('xlsx' | 'csv' | 'pdf')[] };

const FORMAT_ICON = { xlsx: FileSpreadsheetIcon, csv: SheetIcon, pdf: FileTextIcon } as const;

/** Every export dataset the user may use, with direct Excel / CSV / PDF downloads. */
export async function ExportHub({ datasets }: { datasets: ExportHubDataset[] }) {
  const t = await getTranslations('dataManagement.export');
  const tf = await getTranslations('enums.exportFormat');
  if (!datasets.length) {
    return <EmptyState icon={FileDownIcon} title={t('empty.title')} description={t('empty.description')} tone="neutral" />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-muted-foreground">{t('description')}</p>
      <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {datasets.map((d) => (
          <li
            key={d.key}
            data-export-dataset={d.key}
            className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-xs"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
              <FileDownIcon className="size-4" aria-hidden />
            </span>
            <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-medium text-foreground">{d.title}</span>
            <span className="flex shrink-0 items-center gap-1">
              {d.formats.map((f) => {
                const Icon = FORMAT_ICON[f];
                return (
                  <Button key={f} asChild variant="outline" size="sm" className="px-2">
                    <a href={`/api/export/${d.key}?format=${f}`} download aria-label={`${d.title} · ${tf(f)}`}>
                      <Icon aria-hidden />
                      {tf(f)}
                    </a>
                  </Button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
