import { AlarmClockIcon, ClockIcon, IdCardIcon, UsersIcon, UsersRoundIcon, WandSparklesIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack } from '@/components/shared/responsive-grid';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { formatNumber } from '@/lib/format';
import { getTranslator } from '@/lib/i18n/translator';
import { logAndMapError } from '@/lib/errors';
import { pageMetadata } from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';
import { ReportCatalog } from '@/features/reports/components/report-catalog';
import { getReportDefinition, REPORTS } from '@/features/reports/definitions';
import { canOpenReportCenter, canViewReport } from '@/features/reports/filters';
import { fetchCatalogStats } from '@/features/reports/registry';
import type { LucideIcon } from 'lucide-react';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('reports.title');

type Highlight = {
  report: string;
  stat: string | string[];
  labelKey: string;
  hintKey: string;
  icon: LucideIcon;
  tone: StatTone;
  alert?: boolean;
};

/** Headline metrics at the top of the Report Center (each opens its report). */
const HIGHLIGHTS: Highlight[] = [
  {
    report: 'headcount',
    stat: 'headcount',
    labelKey: 'reports.preview.headcount',
    hintKey: 'reports.items.headcount.title',
    icon: UsersIcon,
    tone: 'primary',
  },
  {
    report: 'open-requests',
    stat: 'open',
    labelKey: 'reports.kpis.open',
    hintKey: 'reports.items.openRequests.title',
    icon: ClockIcon,
    tone: 'info',
  },
  {
    report: 'overdue-requests',
    stat: 'overdue',
    labelKey: 'reports.kpis.overdue',
    hintKey: 'reports.items.overdueRequests.title',
    icon: AlarmClockIcon,
    tone: 'danger',
    alert: true,
  },
  {
    report: 'iqama-expiry',
    stat: 'iqama90',
    labelKey: 'reports.preview.expiring90',
    hintKey: 'reports.items.iqamaExpiry.title',
    icon: IdCardIcon,
    tone: 'warning',
  },
];

export default async function ReportsPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/reports']);
  const t = getTranslator(ctx.locale);
  const keys = REPORTS.filter((def) => canViewReport(ctx, def)).map((def) => def.key);

  let stats: Record<string, number> = {};
  try {
    stats = await fetchCatalogStats(await createClient());
  } catch (error) {
    // Previews are optional: the catalog still works without them.
    logAndMapError('reports.catalogStats', error);
  }

  const highlights = HIGHLIGHTS.filter((h) => {
    const def = getReportDefinition(h.report);
    return def && canViewReport(ctx, def);
  });
  // Only the metrics of reports this viewer may open reach the browser.
  const statKeys = new Set<string>([
    ...highlights.flatMap((h) => (typeof h.stat === 'string' ? [h.stat] : h.stat)),
    ...keys.flatMap((key) => {
      const stat = getReportDefinition(key)?.preview?.stat;
      return stat ? [stat] : [];
    }),
  ]);
  const visibleStats = Object.fromEntries(Object.entries(stats).filter(([key]) => statKeys.has(key)));
  const canBuild = canOpenReportCenter(ctx);
  const teamScope = !ctx.isHR;

  return (
    <PageStack>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.catalog.description')}
        titleAddon={
          teamScope ? (
            <SimpleTooltip content={t('reports.catalog.teamScopeHint')}>
              <Badge variant="info" size="sm" tabIndex={0}>
                <UsersRoundIcon />
                {t('reports.catalog.teamScope')}
              </Badge>
            </SimpleTooltip>
          ) : null
        }
        actions={
          canBuild ? (
            <Button asChild>
              <Link href="/reports/builder">
                <WandSparklesIcon />
                {t('reports.catalog.builderAction')}
              </Link>
            </Button>
          ) : null
        }
      />

      {highlights.length >= 2 ? (
        <KpiGrid count={highlights.length === 3 ? 3 : 4}>
          {highlights.map((h) => {
            const value = typeof h.stat === 'string' ? visibleStats[h.stat] : undefined;
            return (
              <StatCard
                key={h.report}
                label={t(h.labelKey)}
                value={
                  typeof value === 'number'
                    ? formatNumber(value, ctx.locale, {
                        maximumFractionDigits: 0,
                      })
                    : '—'
                }
                icon={h.icon}
                tone={h.alert && !value ? 'success' : h.tone}
                hint={t(h.hintKey)}
                href={`/reports/${h.report}`}
              />
            );
          })}
        </KpiGrid>
      ) : null}

      <ReportCatalog keys={keys} stats={visibleStats} canBuild={canBuild} />
    </PageStack>
  );
}
