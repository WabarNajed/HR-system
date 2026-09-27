'use client';

import { DownloadIcon, PlayIcon, TerminalIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { getImportAction } from '../actions';
import type { ImportView } from '../types';
import { ImportRowsList, type RowTab } from './import-rows-list';
import { errorReportHref, importHref, TYPE_ICONS } from './type-meta';
import { useLooseT, useRunAction } from './use-dm';

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'danger' | 'info' }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-lg leading-6 font-semibold numeric',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
          tone === 'info' && 'text-info',
          !tone && 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function ImportDetailsSheet({ importId, onOpenChange }: { importId: string | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('dataManagement');
  const types = useLooseT('dataManagement.types');
  const fmt = useDateFormat();
  const run = useRunAction();
  const [data, setData] = useState<(ImportView & { skipped: number }) | null>(null);

  useEffect(() => {
    let alive = true;
    if (!importId) return;
    setData(null);
    void run(getImportAction({ importId })).then((res) => {
      if (alive && res.ok && res.data) setData(res.data);
      if (alive && !res.ok) onOpenChange(false);
    });
    return () => {
      alive = false;
    };
  }, [importId, run, onOpenChange]);

  const Icon = data ? TYPE_ICONS[data.type] : null;
  const finished = data && (data.status === 'completed' || data.status === 'failed');
  const tabs: RowTab[] = data
    ? finished
      ? [
          { value: 'all', count: data.totals.total },
          { value: 'imported', count: data.totals.imported },
          { value: 'error', count: data.totals.error },
          { value: 'skipped', count: data.skipped },
        ]
      : [
          { value: 'all', count: data.totals.total },
          { value: 'valid', count: data.totals.valid },
          { value: 'warning', count: data.totals.warning },
          { value: 'error', count: data.totals.error },
        ]
    : [];
  const hasReport = data ? data.totals.error > 0 || data.totals.warning > 0 : false;
  const canContinue = data && (data.status === 'uploaded' || data.status === 'validated' || data.status === 'importing');

  return (
    <Sheet open={Boolean(importId)} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full sm:max-w-3xl">
        <SheetHeader>
          {data && Icon ? (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <SheetTitle className="min-w-0 truncate">
                  <bdi>{data.fileName}</bdi>
                </SheetTitle>
                <StatusBadge domain="import" status={data.status} size="sm" />
              </div>
              <SheetDescription>
                {types(`${data.type}.title`)} · {fmt.dateTime(data.createdAt)}
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle>{t('history.details.title')}</SheetTitle>
              <SheetDescription>{t('history.details.loading')}</SheetDescription>
            </>
          )}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          {!data ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Metric label={t('wizard.review.total')} value={data.totals.total} />
                <Metric label={t('wizard.review.valid')} value={data.totals.valid} tone="success" />
                <Metric label={t('wizard.review.warnings')} value={data.totals.warning} tone="warning" />
                <Metric label={t('wizard.review.errors')} value={data.totals.error} tone="danger" />
                <Metric label={t('report.imported')} value={data.totals.imported} tone="info" />
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{t('history.details.by')}</dt>
                  <dd className="mt-0.5 truncate text-foreground">
                    {data.summary.source === 'cli' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <TerminalIcon className="size-3.5 text-muted-foreground" aria-hidden />
                        {t('history.cli')}
                      </span>
                    ) : (
                      <bdi>{data.createdBy?.name || data.createdBy?.email || '—'}</bdi>
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{t('history.details.completed')}</dt>
                  <dd className="mt-0.5 text-foreground">{data.completedAt ? fmt.dateTime(data.completedAt) : '—'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{t('history.details.sheet')}</dt>
                  <dd className="mt-0.5 truncate text-foreground">
                    {data.summary.sheet ? <bdi>{t('history.details.sheetValue', { sheet: data.summary.sheet, row: data.summary.header_row ?? 1 })}</bdi> : '—'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{t('history.details.options')}</dt>
                  <dd className="mt-0.5 text-foreground">
                    {data.options ? (data.options.existing === 'update' ? t('wizard.options.existingUpdate') : t('wizard.options.existingSkip')) : '—'}
                  </dd>
                </div>
              </dl>
              <div className="-mx-5 border-t border-border">
                <ImportRowsList importId={data.id} type={data.type} tabs={tabs} defaultTab={data.totals.error ? 'error' : 'all'} />
              </div>
            </>
          )}
        </SheetBody>
        {data ? (
          <SheetFooter className="flex-wrap">
            {hasReport ? (
              <Button variant="outline" asChild>
                <a href={errorReportHref(data.id)} download>
                  <DownloadIcon />
                  {t('history.actions.downloadReport')}
                </a>
              </Button>
            ) : null}
            {canContinue ? (
              <Button asChild>
                <Link href={importHref({ id: data.id })}>
                  <PlayIcon className="rtl:rotate-180" />
                  {t('history.actions.continue')}
                </Link>
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
