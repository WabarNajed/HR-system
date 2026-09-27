'use client';

import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon, DownloadIcon, HistoryIcon, Loader2Icon, RotateCwIcon, UploadIcon, WifiOffIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Alert, AlertActions, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useErrorMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { ImportType } from '../../lib/types';
import type { BatchResult } from '../../types';
import { errorReportHref, TYPE_DESTINATIONS } from '../type-meta';

export type RunState = {
  phase: 'running' | 'paused' | 'done';
  /** Rows processed / to process (valid + warning rows at start). */
  done: number;
  total: number;
  last: BatchResult | null;
  error: string | null;
};

const MASTER_LABEL: Record<string, ImportType> = { departments: 'departments', job_titles: 'job_titles', locations: 'locations', cost_centers: 'cost_centers' };

export function StepRun({
  importId,
  type,
  fileName,
  state,
  onResume,
  onNewImport,
  warnings,
}: {
  importId: string;
  type: ImportType;
  fileName: string;
  state: RunState;
  onResume: () => void;
  onNewImport: () => void;
  warnings: number;
}) {
  const t = useTranslations('dataManagement');
  const resolve = useErrorMessage();
  const pct = state.total ? Math.round((state.done / state.total) * 100) : state.phase === 'done' ? 100 : 0;

  if (state.phase !== 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 py-6 text-center">
        <span className={cn('flex size-14 items-center justify-center rounded-2xl', state.phase === 'paused' ? 'bg-warning-soft text-warning' : 'bg-primary-soft text-primary')}>
          {state.phase === 'paused' ? <WifiOffIcon className="size-7" aria-hidden /> : <Loader2Icon className="size-7 animate-spin" aria-hidden />}
        </span>
        <div>
          <h2 className="text-section-title text-foreground">{t('wizard.run.title')}</h2>
          <p className="mt-1 text-meta text-muted-foreground">{t('wizard.run.description')}</p>
        </div>
        <div className="w-full" role="status" aria-live="polite">
          <Progress value={pct} className="h-2.5" tone={state.phase === 'paused' ? 'warning' : 'primary'} />
          <div className="mt-2 flex items-center justify-between text-meta text-muted-foreground numeric">
            <span>{t('wizard.run.progress', { done: state.done, total: state.total })}</span>
            <span className="font-semibold text-foreground">{pct}%</span>
          </div>
        </div>
        {state.phase === 'paused' ? (
          <Alert variant="warning" className="text-start">
            <AlertTriangleIcon />
            <AlertDescription>
              <p>{state.error && state.error !== 'errors.network' ? resolve(state.error) : t('wizard.run.batchFailed')}</p>
            </AlertDescription>
            <AlertActions>
              <Button size="sm" onClick={onResume}>
                <RotateCwIcon />
                {t('wizard.run.resume')}
              </Button>
            </AlertActions>
          </Alert>
        ) : null}
      </div>
    );
  }

  const r = state.last?.result ?? { created: 0, updated: 0, skipped: 0, failed: 0, master_created: {} };
  const failed = state.last?.failed ?? r.failed;
  const skipped = state.last?.skipped ?? r.skipped;
  const ok = state.last?.status !== 'failed';
  const master = Object.entries(r.master_created ?? {}).filter(([, n]) => n > 0);
  const stats = [
    { key: 'created', value: r.created, cls: 'text-success' },
    { key: 'updated', value: r.updated, cls: 'text-info' },
    { key: 'skipped', value: skipped, cls: 'text-muted-foreground' },
    { key: 'failed', value: failed, cls: failed ? 'text-danger' : 'text-muted-foreground' },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 py-4 text-center">
      <span className={cn('flex size-14 items-center justify-center rounded-2xl', ok && !failed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
        {ok && !failed ? <CheckCircle2Icon className="size-7" aria-hidden /> : <AlertTriangleIcon className="size-7" aria-hidden />}
      </span>
      <div>
        <h2 className="text-section-title text-foreground">{ok && !failed ? t('wizard.run.doneTitle') : t('wizard.run.failedTitle')}</h2>
        <p className="mt-1 text-meta text-muted-foreground">
          <bdi>{t('wizard.run.doneDescription', { file: fileName, type: t(`types.${type}.title`) })}</bdi>
        </p>
      </div>
      <dl className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-lg border border-border bg-card px-3 py-3 shadow-xs">
            <dt className="truncate text-xs font-medium text-muted-foreground">{t(`wizard.run.${s.key}`)}</dt>
            <dd className={cn('mt-0.5 text-2xl leading-8 font-semibold numeric', s.cls)}>{s.value}</dd>
          </div>
        ))}
      </dl>
      {master.length || r.linked ? (
        <div className="w-full rounded-lg border border-border bg-subtle/70 px-4 py-3 text-start text-meta">
          {master.length ? (
            <p className="text-foreground">
              <span className="font-medium">{t('wizard.run.masterCreated')}: </span>
              {master.map(([table, n]) => t('wizard.run.masterCreatedItem', { count: n, table: MASTER_LABEL[table] ? t(`types.${MASTER_LABEL[table]}.title`) : table })).join(' · ')}
            </p>
          ) : null}
          {r.linked ? <p className="mt-1 text-muted-foreground">{t('wizard.run.linked', { count: r.linked })}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href={TYPE_DESTINATIONS[type]}>
            {type === 'employees' ? t('wizard.run.viewEmployees') : t('wizard.run.viewRecords', { type: t(`types.${type}.title`) })}
            <ArrowRightIcon className="rtl:rotate-180" />
          </Link>
        </Button>
        {failed || warnings ? (
          <Button asChild variant="outline">
            <a href={errorReportHref(importId)} download>
              <DownloadIcon />
              {t('wizard.run.downloadReport')}
            </a>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/admin/data-management?tab=history">
            <HistoryIcon />
            {t('wizard.run.viewHistory')}
          </Link>
        </Button>
        <Button variant="ghost" onClick={onNewImport}>
          <UploadIcon />
          {t('wizard.run.newImport')}
        </Button>
      </div>
    </div>
  );
}
