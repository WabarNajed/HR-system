import { AlertTriangleIcon, ChevronDownIcon, DatabaseZapIcon, FileSpreadsheetIcon, HistoryIcon, UploadIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { ExportHub, type ExportHubGroup } from '@/features/data-management/components/export-hub';
import { HubCards } from '@/features/data-management/components/hub-cards';
import { ImportHistoryTable } from '@/features/data-management/components/import-history-table';
import { TemplatesGrid } from '@/features/data-management/components/templates-grid';
import { importHref, templateHref, TYPE_GROUPS, TYPE_ICONS } from '@/features/data-management/components/type-meta';
import { isImportType, MASTER_DATA_TYPES } from '@/features/data-management/lib/types';
import { allowedImportTypes } from '@/features/data-management/permissions';
import { getHubStats, HISTORY_FILTERS, HISTORY_SORTS, listImportHistory } from '@/features/data-management/server/queries';
import { requireAccess } from '@/lib/auth/guards';
import { EXPORT_FORMATS } from '@/lib/export/types';
import { listExportDatasets } from '@/lib/export/registry';
import { formatDateTime } from '@/lib/dates';
import { getTranslator } from '@/lib/i18n/translator';
import { parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('dataManagement.title');

/** Server Actions used on the hub (import details, cancel) inherit this limit. */
export const maxDuration = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminDataManagementPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/admin/data-management']);
  const sp = await searchParams;
  // Deep link used by other pages: /admin/data-management?type=employees → the import wizard.
  const typeParam = typeof sp.type === 'string' ? sp.type : undefined;
  if (typeParam && isImportType(typeParam)) redirect(importHref({ type: typeParam }));

  const tab = sp.tab === 'export' || sp.tab === 'templates' ? sp.tab : 'history';
  const t = await getTranslations('dataManagement');
  const allowed = allowedImportTypes(ctx);
  const supabase = await createClient();

  const [stats, history] = await Promise.all([
    getHubStats(supabase),
    tab === 'history'
      ? listImportHistory(
          supabase,
          parseListParams(sp, { allowedSorts: HISTORY_SORTS, filterKeys: HISTORY_FILTERS, defaultSort: 'created_at', defaultDir: 'desc' }),
        )
      : Promise.resolve(null),
  ]);

  const lt = getTranslator(ctx.locale);
  const exportGroups: ExportHubGroup[] = [];
  if (tab === 'export') {
    // Grouped by owning area, in registry order. The custom report builder needs a saved configuration → not listed.
    for (const d of listExportDatasets()) {
      if (!can(ctx, d.permission) || d.key === 'report-builder') continue;
      const groupKey = d.key === 'imports' ? 'dataManagement' : d.key.startsWith('report-') ? 'reports' : d.permission.split('.')[0]!;
      let group = exportGroups.find((g) => g.key === groupKey);
      if (!group) {
        const label =
          groupKey === 'dataManagement'
            ? lt('dataManagement.title')
            : lt.has(`enums.permissionModule.${groupKey}`)
              ? lt(`enums.permissionModule.${groupKey}`)
              : groupKey;
        group = { key: groupKey, label, datasets: [] };
        exportGroups.push(group);
      }
      group.datasets.push({ key: d.key, title: lt.has(d.titleKey) ? lt(d.titleKey) : d.key, formats: d.formats ?? EXPORT_FORMATS });
    }
  }

  const errorsOnly = sp.errors === '1';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileSpreadsheetIcon />
                  {t('hub.templates')}
                  <ChevronDownIcon className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {TYPE_GROUPS.map((group, gi) => (
                  <div key={group.key}>
                    {gi > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel className="text-xs text-muted-foreground">{t(`groups.${group.key}`)}</DropdownMenuLabel>
                    {group.types.map((type) => {
                      const Icon = TYPE_ICONS[type];
                      return (
                        <DropdownMenuItem key={type} asChild>
                          <a href={templateHref(type)} download>
                            <Icon />
                            {t(`types.${type}.title`)}
                          </a>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {allowed.length ? (
              <Button asChild>
                <Link href={importHref()}>
                  <UploadIcon />
                  {t('hub.newImport')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <KpiGrid>
        <StatCard
          label={t('hub.kpi.imports')}
          value={stats.imports30}
          icon={DatabaseZapIcon}
          tone="primary"
          hint={t('hub.kpi.importsHint', { count: stats.importsTotal })}
        />
        <StatCard label={t('hub.kpi.records')} value={stats.records30} icon={UploadIcon} tone="success" hint={t('hub.kpi.recordsHint')} />
        <StatCard
          label={t('hub.kpi.errors')}
          value={stats.errors30}
          icon={AlertTriangleIcon}
          tone={stats.errors30 ? 'danger' : 'neutral'}
          hint={t('hub.kpi.errorsHint')}
          href={stats.errors30 ? '/admin/data-management?tab=history&errors=1' : undefined}
        />
        <StatCard
          label={t('hub.kpi.lastImport')}
          value={stats.last ? <span className="text-base leading-8 font-semibold sm:text-lg">{t(`types.${stats.last.type}.title`)}</span> : '—'}
          icon={HistoryIcon}
          tone="info"
          hint={
            stats.last ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <StatusBadge domain="import" status={stats.last.status} size="sm" dot={false} />
                <span className="truncate">{formatDateTime(stats.last.createdAt, ctx.locale)}</span>
              </span>
            ) : (
              t('hub.kpi.never')
            )
          }
        />
      </KpiGrid>

      <HubCards canEmployees={allowed.includes('employees')} canMaster={allowed.some((x) => MASTER_DATA_TYPES.includes(x))} />

      <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card">
        <div className="px-4 pt-1 sm:px-5">
          <LinkTabs
            aria-label={t('title')}
            value={tab}
            items={[
              { value: 'history', label: t('hub.tabs.history'), count: stats.importsTotal || null },
              { value: 'export', label: t('hub.tabs.export') },
              { value: 'templates', label: t('hub.tabs.templates') },
            ]}
          />
        </div>
        <div className={tab === 'history' ? 'p-3 sm:p-4' : 'p-4 sm:p-5'}>
          {tab === 'history' && history ? (
            <ImportHistoryTable rows={history.rows} total={history.total} errorsOnly={errorsOnly} canStart={allowed.length > 0} types={allowed} />
          ) : null}
          {tab === 'export' ? <ExportHub groups={exportGroups} /> : null}
          {tab === 'templates' ? <TemplatesGrid allowed={allowed} /> : null}
        </div>
      </section>
    </div>
  );
}
