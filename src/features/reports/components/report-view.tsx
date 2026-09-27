'use client';

import { PrinterIcon, UsersRoundIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack } from '@/components/shared/responsive-grid';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/config';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { formatNumber } from '@/lib/format';
import { mergeSearchParams } from '@/lib/list-params';
import { cn } from '@/lib/utils';
import { getReportDefinition, reportDatasetKey, type KpiDef, type ReportDefinition } from '../definitions';
import { activeFilterCount, type ReportFilterState } from '../filters';
import type { FilterOption } from '../queries';
import type { ReportSummary } from '../registry';
import type { FacetOption } from './facet-filter';
import { formatValue, useReportT, type LooseT } from './format';
import { rememberReport } from './recent-reports';
import { ReportExportMenu } from './export-menu';
import { ReportChart } from './report-chart';
import { ReportFilterBar, type FilterPatch } from './report-filter-bar';
import { ReportTable } from './report-table';

export type ReportViewProps = {
  reportKey: string;
  state: ReportFilterState;
  options: Partial<Record<string, FilterOption[]>>;
  employeeOptions: FacetOption[];
  summary: ReportSummary;
  rows: Record<string, unknown>[];
  total: number;
  /** i18n key explaining why export is unavailable (null = allowed). */
  exportDisabledKey: string | null;
  teamScope: boolean;
  generatedAt: string;
};

function kpiHint(kpi: KpiDef, kpis: ReportSummary['kpis'], locale: Locale, t: LooseT): string | undefined {
  if (!kpi.hintKey) return undefined;
  if (!kpi.hintValueKey) return t(kpi.hintKey);
  if (kpi.hintValueKey === 'largest') {
    const label = (locale === 'ar' ? kpis.largest_ar : kpis.largest_en) ?? kpis.largest_ar ?? kpis.largest_en;
    return label ? t(kpi.hintKey, { value: String(label) }) : undefined;
  }
  const v = kpis[kpi.hintValueKey];
  if (v === null || v === undefined) return undefined;
  return t(kpi.hintKey, {
    value: formatNumber(Number(v), locale, { maximumFractionDigits: 1 }),
  });
}

function ExportMenu({ def, disabledKey, queryString }: { def: ReportDefinition; disabledKey: string | null; queryString: string }) {
  const t = useReportT();
  const href = (format: string) => {
    const params = new URLSearchParams(queryString);
    params.delete('page');
    params.delete('pageSize');
    params.set('format', format);
    return `/api/export/${reportDatasetKey(def.key)}?${params.toString()}`;
  };
  return (
    <ReportExportMenu href={href} disabledReason={disabledKey ? t(disabledKey) : null} hint={t('common.table.exportHint')} />
  );
}

/** Report page body: header, filters, KPIs, chart(s) and the detail table. */
export function ReportView({
  reportKey,
  state,
  options,
  employeeOptions,
  summary,
  rows,
  total,
  exportDisabledKey,
  teamScope,
  generatedAt,
}: ReportViewProps) {
  const def = getReportDefinition(reportKey)!;
  const t = useReportT();
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [chartIndex, setChartIndex] = useState(0);

  useEffect(() => rememberReport(reportKey), [reportKey]);

  const navigate = (patch: FilterPatch) => {
    const next = mergeSearchParams(searchParams, patch);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const queryString = useMemo(
    () =>
      mergeSearchParams(searchParams, {
        page: null,
        pageSize: null,
      }).toString(),
    [searchParams],
  );
  const chart = def.charts[chartIndex] ?? def.charts[0];
  const filtered = activeFilterCount(state) > 0 || Boolean(searchParams.get('q'));
  const GroupIcon = def.icon;
  const kpiCount = Math.min(Math.max(def.kpis.length, 3), 5) as 3 | 4 | 5;

  return (
    <PageStack className="report-print">
      <PageHeader
        title={t(`reports.items.${def.i18n}.title`)}
        description={t(`reports.items.${def.i18n}.description`)}
        leading={
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary-soft text-primary ring-1 ring-primary/10 ring-inset">
            <GroupIcon className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
        }
        titleAddon={
          <>
            <Badge variant="neutral" size="sm">
              {t(`reports.groups.${def.group}`)}
            </Badge>
            {teamScope ? (
              <Badge variant="info" size="sm">
                <UsersRoundIcon />
                {t('reports.catalog.teamScope')}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <PrinterIcon />
              <span className="max-sm:sr-only">{t('reports.view.print')}</span>
            </Button>
            <ExportMenu def={def} disabledKey={exportDisabledKey} queryString={queryString} />
          </div>
        }
      >
        <p className="hidden text-meta text-muted-foreground print:block">
          {t('reports.view.generatedAt', { date: fmt.dateTime(generatedAt) })}
        </p>
      </PageHeader>

      <ReportFilterBar
        def={def}
        state={state}
        options={options}
        employeeOptions={employeeOptions}
        onChange={navigate}
        pending={isPending}
      />

      <div
        className={cn('flex flex-col gap-5 transition-opacity duration-200', isPending && 'pointer-events-none opacity-60')}
        aria-busy={isPending || undefined}
      >
        <KpiGrid count={kpiCount} className={cn(kpiCount === 5 && 'xl:grid-cols-5', kpiCount === 3 && 'lg:grid-cols-3')}>
          {def.kpis.map((kpi, i) => (
            <StatCard
              key={kpi.key}
              className={cn(def.kpis.length % 2 === 1 && i === def.kpis.length - 1 && 'max-lg:col-span-2')}
              label={t(kpi.labelKey)}
              value={formatValue(summary.kpis[kpi.key] ?? (kpi.format === 'percent' ? null : 0), kpi.format, locale, t)}
              icon={kpi.icon}
              tone={kpi.tone}
              hint={kpiHint(kpi, summary.kpis, locale, t)}
            />
          ))}
        </KpiGrid>

        {chart ? (
          <section
            data-slot="section-card"
            className="flex min-w-0 break-inside-avoid flex-col rounded-lg border border-border bg-card shadow-card"
          >
            <div className="flex flex-col gap-2.5 px-5 pt-4 pb-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-card-title text-foreground">{t(chart.titleKey)}</h2>
              {def.charts.length > 1 ? (
                <SegmentedTabs
                  size="sm"
                  aria-label={t('reports.charts.viewAs')}
                  className="self-start print:hidden sm:self-auto"
                  value={String(chartIndex)}
                  onValueChange={(v) => setChartIndex(Number(v))}
                  items={def.charts.map((c, i) => ({
                    value: String(i),
                    label: t(`reports.chartTabs.${c.tab ?? c.key}`),
                  }))}
                />
              ) : null}
            </div>
            <div className="px-5 pt-3 pb-5">
              <ReportChart def={chart} points={(summary.charts[chart.key] ?? []) as Array<Record<string, unknown> & { key: string }>} />
            </div>
          </section>
        ) : null}

        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="report-table-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="report-table-title" className="text-section-title text-foreground">
              {t(def.tableTitleKey ?? 'reports.view.details')}
            </h2>
            <span className="text-meta text-muted-foreground numeric">{t('reports.view.rowsTotal', { count: total })}</span>
          </div>
          <ReportTable def={def} rows={rows} total={total} filtered={filtered} />
        </section>
      </div>

      <style>{PRINT_CSS}</style>
    </PageStack>
  );
}

/** Print: hide the app chrome and interactive controls; keep header, KPIs, chart and table. */
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  [data-sidebar] { --shell-sidebar: 0px !important; }
  aside, header.sticky, [data-slot="data-table-toolbar"], [data-slot="data-table-pagination"], nextjs-portal { display: none !important; }
  #main { padding: 0 !important; }
  .report-print [data-slot="data-table"] > div { overflow: visible !important; max-height: none !important; box-shadow: none !important; }
  .report-print section, .report-print [data-slot="section-card"] { break-inside: avoid; box-shadow: none !important; }
  body { background: #fff !important; }
}
`;
