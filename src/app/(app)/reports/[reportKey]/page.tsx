import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { requireAccess } from '@/lib/auth/guards';
import { todayIso } from '@/lib/i18n/date-format';
import { getTranslator } from '@/lib/i18n/translator';
import { parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';
import { ReportView } from '@/features/reports/components/report-view';
import { canExportReport, canViewReport, readReportFilters, searchParamsGetter } from '@/features/reports/filters';
import { loadEmployeeOptions, loadFilterOptions } from '@/features/reports/queries';
import { fetchReportPage, fetchReportRows, fetchReportSummary, getReport, sortableColumnIds } from '@/features/reports/registry';

type PageProps = {
  params: Promise<{ reportKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reportKey } = await params;
  const def = getReport(reportKey);
  return pageMetadata(def ? `reports.items.${def.i18n}.title` : 'reports.title');
}

/** Maximum rows loaded for aggregate ("all") tables — they are grouped, so small in practice. */
const AGGREGATE_ROW_LIMIT = 5000;

export default async function ReportPage({ params, searchParams }: PageProps) {
  const ctx = await requireAccess(ROUTE_ACCESS['/reports/[reportKey]']);
  const [{ reportKey }, sp] = await Promise.all([params, searchParams]);
  const def = getReport(reportKey);
  if (!def) notFound();
  if (!canViewReport(ctx, def)) forbidden();

  const state = readReportFilters(def, searchParamsGetter(sp), todayIso());
  const list = parseListParams(sp, {
    allowedSorts: sortableColumnIds(def),
    defaultSort: def.defaultSort.id,
    defaultDir: def.defaultSort.desc ? 'desc' : 'asc',
  });
  const supabase = await createClient({ timeoutMs: 20_000 });

  const tableQuery = { q: list.q, sort: list.sort, dir: list.dir };
  const [summary, table, options, employeeOptions] = await Promise.all([
    fetchReportSummary(supabase, def, state),
    def.table === 'paged'
      ? fetchReportPage(supabase, def, state, { ...tableQuery, from: list.from, to: list.to }, ctx.locale)
      : fetchReportRows(supabase, def, state, { q: '', sort: def.defaultSort.id, dir: def.defaultSort.desc ? 'desc' : 'asc' }, ctx.locale, AGGREGATE_ROW_LIMIT).then(
          (rows) => ({ rows, total: rows.length }),
        ),
    loadFilterOptions(supabase, def.filters, ctx.locale),
    loadEmployeeOptions(supabase, state.values.employee ?? [], ctx.locale),
  ]);

  const t = getTranslator(ctx.locale);

  return (
    <>
      <BreadcrumbLabel label={t(`reports.items.${def.i18n}.title`)} />
      <ReportView
        reportKey={def.key}
        state={state}
        options={options}
        employeeOptions={employeeOptions}
        summary={summary}
        rows={table.rows}
        total={table.total}
        canExport={canExportReport(ctx, def)}
        teamScope={!ctx.isHR}
        generatedAt={new Date().toISOString()}
      />
    </>
  );
}
