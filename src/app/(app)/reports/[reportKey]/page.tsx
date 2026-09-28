import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { requireAccess } from '@/lib/auth/guards';
import { mapError } from '@/lib/errors';
import { todayIso } from '@/lib/i18n/date-format';
import { getTranslator } from '@/lib/i18n/translator';
import { parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
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

type Loaded<T> = { ok: true; value: T } | { ok: false; errorKey: string };

/**
 * Settles one section's query on its own: a failing summary or table (e.g. a statement timeout)
 * becomes that section's error state instead of taking the whole page to the route error boundary.
 * The raw error is logged server-side only; the view gets an i18n key (src/lib/errors.ts).
 */
function settle<T>(section: string, reportKey: string, promise: Promise<T>): Promise<Loaded<T>> {
  return promise.then(
    (value): Loaded<T> => ({ ok: true, value }),
    (error: unknown): Loaded<T> => {
      console.error(`[reports] ${reportKey}: ${section} failed`, error);
      return { ok: false, errorKey: mapError(error) };
    },
  );
}

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
    settle('summary', def.key, fetchReportSummary(supabase, def, state)),
    settle(
      'table',
      def.key,
      def.table === 'paged'
        ? fetchReportPage(supabase, def, state, { ...tableQuery, from: list.from, to: list.to }, ctx.locale)
        : fetchReportRows(
            supabase,
            def,
            state,
            {
              q: '',
              sort: def.defaultSort.id,
              dir: def.defaultSort.desc ? 'desc' : 'asc',
            },
            ctx.locale,
            AGGREGATE_ROW_LIMIT,
          ).then((rows) => ({ rows, total: rows.length })),
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
        summary={summary.ok ? summary.value : null}
        summaryErrorKey={summary.ok ? null : summary.errorKey}
        rows={table.ok ? table.value.rows : []}
        total={table.ok ? table.value.total : 0}
        tableErrorKey={table.ok ? null : table.errorKey}
        exportDisabledKey={
          canExportReport(ctx, def) ? null : can(ctx, 'reports.export') ? 'reports.view.exportRestricted' : 'reports.view.exportDisabled'
        }
        teamScope={!ctx.isHR}
        generatedAt={new Date().toISOString()}
      />
    </>
  );
}
