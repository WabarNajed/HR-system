import { ArchiveIcon, DatabaseIcon, FileArchiveIcon, HistoryIcon, LockKeyholeIcon, ShieldCheckIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { BackupDownloadButton } from '@/features/backup/components/backup-download-button';
import { ResetOrganization } from '@/features/backup/components/reset-organization';
import { BACKUP_GROUPS, backupTablesFor } from '@/features/backup/lib/entities';
import { getBackupCounts, getBackupHistory, getLastReset } from '@/features/backup/server/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatDateTime, formatRelative } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('backup.title');

/** The organization reset Server Action (RPC + storage clean-up) inherits this limit. */
export const maxDuration = 300;

/** Backup package (download + history from the audit trail) and the organization reset danger zone. */
export default async function AdminBackupPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/admin/backup']);
  const t = await getTranslations('backup');
  const supabase = await createClient();
  const includeSensitive = ctx.isSuperAdmin;
  const canAudit = can(ctx, 'audit.view');
  const [counts, history, lastReset] = await Promise.all([
    getBackupCounts(supabase, includeSensitive),
    canAudit ? getBackupHistory(supabase, 12) : Promise.resolve({ rows: [], total: 0 }),
    canAudit ? getLastReset(supabase) : Promise.resolve(null),
  ]);
  const tables = backupTablesFor(includeSensitive);
  const last = history.rows[0] ?? null;
  const locale = ctx.locale;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('title')} description={t('description')} />

      <KpiGrid>
        <StatCard
          label={t('kpi.lastBackup')}
          value={last ? <span className="text-lg leading-8 font-semibold">{formatRelative(last.at, locale)}</span> : '—'}
          icon={HistoryIcon}
          tone="info"
          hint={last ? formatDateTime(last.at, locale) : t('kpi.never')}
        />
        <StatCard label={t('kpi.backups')} value={canAudit ? formatInteger(history.total, locale) : '—'} icon={ArchiveIcon} tone="primary" hint={t('kpi.backupsHint')} />
        <StatCard
          label={t('kpi.records')}
          value={formatInteger(counts.total, locale)}
          icon={DatabaseIcon}
          tone="success"
          hint={t('kpi.recordsHint', { count: tables.length })}
        />
        <StatCard
          label={t('kpi.sensitive')}
          value={<span className="text-lg leading-8 font-semibold">{includeSensitive ? t('kpi.sensitiveIncluded') : t('kpi.sensitiveExcluded')}</span>}
          icon={LockKeyholeIcon}
          tone={includeSensitive ? 'warning' : 'neutral'}
          hint={includeSensitive ? t('kpi.sensitiveIncludedHint') : t('kpi.sensitiveExcludedHint')}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <FileArchiveIcon className="size-[1.125rem]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-card-title text-foreground">{t('create.title')}</h2>
                <p className="mt-0.5 max-w-2xl text-meta text-muted-foreground">{t('create.description')}</p>
              </div>
            </div>
            <BackupDownloadButton className="shrink-0" />
          </div>
          <div className="px-5 py-4">
            <h3 className="mb-3 text-xs font-semibold text-muted-foreground">{t('create.contents')}</h3>
            <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {BACKUP_GROUPS.map((group, gi) => {
                const items = tables.filter((x) => x.group === group);
                const lastOdd = gi === BACKUP_GROUPS.length - 1 && BACKUP_GROUPS.length % 2 === 1;
                return (
                  <li key={group} className={lastOdd ? 'rounded-md border border-border bg-subtle/60 px-3.5 py-3 md:col-span-2' : 'rounded-md border border-border bg-subtle/60 px-3.5 py-3'}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{t(`groups.${group}`)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground numeric">{t('create.rows', { count: formatInteger(counts.byGroup[group], locale) })}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {items.map((x) => (
                        <Badge key={x.table} variant={x.sensitive ? 'warning' : 'outline'} size="sm" className="font-normal">
                          {x.sensitive ? <LockKeyholeIcon /> : null}
                          {t(`tables.${x.table}` as 'tables.employees')}
                          <span className="text-muted-foreground numeric">{formatInteger(counts.byTable[x.table] ?? 0, locale)}</span>
                        </Badge>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheckIcon className="size-3.5" aria-hidden />
                {t('create.sensitiveNote')}
              </span>
              <span>{t('create.format')}</span>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card">
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-card-title text-foreground">{t('history.title')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('history.description')}</p>
            </div>
            {canAudit ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/audit-logs">{t('history.viewAudit')}</Link>
              </Button>
            ) : null}
          </div>
          {!canAudit ? (
            <EmptyState icon={LockKeyholeIcon} title={t('history.noAccess')} tone="neutral" className="min-h-40" />
          ) : history.rows.length === 0 ? (
            <EmptyState icon={ArchiveIcon} title={t('history.empty')} tone="neutral" className="min-h-40" />
          ) : (
            <ul className="divide-y divide-border">
              {history.rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileArchiveIcon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{formatDateTime(row.at, locale)}</span>
                      {row.sensitive ? (
                        <Badge variant="warning" size="sm">
                          <LockKeyholeIcon />
                          {t('history.sensitive')}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.tables !== null && row.rows !== null ? t('history.summary', { tables: row.tables, rows: formatInteger(row.rows, locale) }) : null}
                      {row.by ? <> · <bdi>{t('history.by', { name: row.by })}</bdi></> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ResetOrganization
        canReset={ctx.isSuperAdmin}
        canBackup
        lastReset={lastReset ? t('reset.lastReset', { date: formatDateTime(lastReset.at, locale), name: lastReset.by ?? '—' }) : null}
      />
    </div>
  );
}
