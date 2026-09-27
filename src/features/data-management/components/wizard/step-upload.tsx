'use client';

import { DownloadIcon, FileSpreadsheetIcon, InfoIcon, Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FileDropzone } from '@/components/shared/file-dropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSchema } from '../../lib/schemas';
import type { ImportType } from '../../lib/types';
import { MAX_IMPORT_BYTES } from '../../lib/workbook';
import { templateHref, TYPE_ICONS } from '../type-meta';
import { useFieldLabel } from '../use-dm';

const ACCEPT = ['.xlsx', '.xlsm', '.csv'];

export function StepUpload({
  type,
  uploading,
  fileName,
  onFile,
}: {
  type: ImportType;
  uploading: boolean;
  fileName: string | null;
  onFile: (file: File) => void;
}) {
  const t = useTranslations('dataManagement');
  const label = useFieldLabel(type);
  const schema = getSchema(type);
  const Icon = TYPE_ICONS[type];
  const columns = schema.fields.filter((f) => f.template !== false && !f.informational);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h2 className="text-section-title text-foreground">{t('wizard.upload.title')}</h2>
          <p className="mt-1 text-meta text-muted-foreground">{t('wizard.upload.description')}</p>
        </div>
        {uploading ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary-soft/30 px-6 py-10 text-center" role="status" aria-live="polite">
            <Loader2Icon className="size-8 animate-spin text-primary" aria-hidden />
            <div className="text-sm font-medium text-foreground">{fileName ? t('wizard.upload.reading', { file: fileName }) : t('wizard.upload.parsing')}</div>
          </div>
        ) : (
          <FileDropzone
            accept={ACCEPT}
            maxSize={MAX_IMPORT_BYTES}
            value={[]}
            onChange={(files) => {
              if (files[0]) onFile(files[0]);
            }}
            className="[&>[role=button]]:min-h-52"
          />
        )}
        <p className="flex items-start gap-2 text-meta text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          {t('wizard.upload.hint')}
        </p>
      </div>
      <aside className="flex flex-col gap-4 rounded-lg border border-border bg-subtle/70 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{t(`types.${type}.title`)}</div>
            <div className="line-clamp-2 text-xs text-muted-foreground">{t(`types.${type}.description`)}</div>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full">
          <a href={templateHref(type)} download>
            <FileSpreadsheetIcon />
            {t('wizard.upload.downloadTemplate', { type: t(`types.${type}.title`) })}
            <DownloadIcon className="ms-auto text-muted-foreground" />
          </a>
        </Button>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{t('wizard.mapping.fieldGroups.required')}</div>
          <ul className="flex flex-col gap-1">
            {schema.requiredAnyOf.map((group) => (
              <li key={group.join('|')} className="text-meta text-foreground">
                {group.map((k) => label(k)).join(' / ')}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{t('wizard.mapping.fieldGroups.fields')}</div>
          <div className="flex flex-wrap gap-1">
            {columns.slice(0, 12).map((f) => (
              <Badge key={f.key} variant="outline" size="sm" className="font-normal">
                {label(f.key)}
              </Badge>
            ))}
            {columns.length > 12 ? (
              <Badge variant="neutral" size="sm" className="numeric">
                <bdi dir="ltr">+{columns.length - 12}</bdi>
              </Badge>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
