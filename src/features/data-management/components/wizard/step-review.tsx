'use client';

import { AlertTriangleIcon, CheckCircle2Icon, DownloadIcon, ListChecksIcon, PlayIcon, RefreshCwIcon, XCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LoadingButton } from '@/components/shared/loading-button';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ImportOptions, ImportType } from '../../lib/types';
import type { ValidationView } from '../../types';
import { ImportRowsList, type RowTab } from '../import-rows-list';
import { errorReportHref } from '../type-meta';
import { ImportOptionsPanel, type OptionCaps } from './import-options';

function Tile({ label, value, tone, icon: Icon }: { label: string; value: number; tone: 'neutral' | 'success' | 'warning' | 'danger'; icon: typeof CheckCircle2Icon }) {
  const toneCls = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-xs">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', toneCls)}>
        <Icon className="size-[1.125rem]" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-xl leading-7 font-semibold text-foreground numeric">{value}</div>
      </div>
    </div>
  );
}

export function StepReview({
  importId,
  type,
  validation,
  validating,
  reloadKey,
  options,
  appliedOptions,
  caps,
  hasLeaveColumn,
  onOptionsChange,
  onRecheck,
  onStart,
}: {
  importId: string;
  type: ImportType;
  validation: ValidationView;
  validating: boolean;
  reloadKey: number;
  options: ImportOptions;
  appliedOptions: ImportOptions;
  caps: OptionCaps;
  hasLeaveColumn: boolean;
  onOptionsChange: (next: ImportOptions) => void;
  onRecheck: () => void;
  onStart: () => void;
}) {
  const t = useTranslations('dataManagement.wizard');
  const v = validation.totals;
  const importable = v.create + v.update;
  const dirty = JSON.stringify(options) !== JSON.stringify(appliedOptions);
  const tabs: RowTab[] = [
    { value: 'all', count: v.total },
    { value: 'valid', count: v.valid },
    { value: 'warning', count: v.warning },
    { value: 'error', count: v.error },
    ...(validation.skipped ? [{ value: 'skipped' as const, count: validation.skipped }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-section-title text-foreground">{t('review.title')}</h2>
        <p className="mt-1 text-meta text-muted-foreground">{t('review.description')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile label={t('review.total')} value={v.total} tone="neutral" icon={ListChecksIcon} />
        <Tile label={t('review.valid')} value={v.valid} tone="success" icon={CheckCircle2Icon} />
        <Tile label={t('review.warnings')} value={v.warning} tone="warning" icon={AlertTriangleIcon} />
        <Tile label={t('review.errors')} value={v.error} tone="danger" icon={XCircleIcon} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs', validating && 'pointer-events-none opacity-60 transition-opacity')}>
          <ImportRowsList importId={importId} type={type} tabs={tabs} defaultTab={v.error ? 'error' : v.warning ? 'warning' : 'all'} reloadKey={reloadKey} />
        </div>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <div className="mb-3 text-card-title text-foreground">{t('options.title')}</div>
            <ImportOptionsPanel type={type} options={options} caps={caps} hasLeaveColumn={hasLeaveColumn} disabled={validating} onChange={onOptionsChange} />
            {dirty ? (
              <LoadingButton variant="secondary" className="mt-3 w-full" pending={validating} onClick={onRecheck}>
                {validating ? null : <RefreshCwIcon />}
                {t('options.apply')}
              </LoadingButton>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
            <dl className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['willCreate', v.create, 'text-success'],
                  ['willUpdate', v.update, 'text-info'],
                  ['willSkip', v.skip, 'text-muted-foreground'],
                ] as const
              ).map(([key, n, cls]) => (
                <div key={key} className="rounded-md bg-subtle px-2 py-2">
                  <dt className="truncate text-xs text-muted-foreground">{t(`review.${key}`)}</dt>
                  <dd className={cn('text-lg leading-6 font-semibold numeric', cls)}>{n}</dd>
                </div>
              ))}
            </dl>
            {importable === 0 ? <p className="text-xs text-danger">{t('review.nothingToImport')}</p> : null}
            <SimpleTooltip content={dirty ? t('options.apply') : importable === 0 ? t('review.nothingToImport') : null}>
              <span tabIndex={dirty || importable === 0 ? 0 : -1} className="block">
                <Button className="w-full" size="lg" disabled={validating || dirty || importable === 0} onClick={onStart}>
                  <PlayIcon className="rtl:rotate-180" />
                  {t('review.startImport', { count: importable })}
                </Button>
              </span>
            </SimpleTooltip>
            {v.error || v.warning ? (
              <Button asChild variant="outline" className="w-full">
                <a href={errorReportHref(importId)} download>
                  <DownloadIcon />
                  {t('review.downloadReport')}
                </a>
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
