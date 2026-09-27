import 'server-only';

import { ActionError } from '@/lib/action';
import type { SessionContext } from '@/lib/auth/session';
import { defineDataset, type AnyExportDataset, type ExportColumn, type ExportColumnType } from '@/lib/export/types';
import { formatDateRange, formatHijriDate, formatMonthYear, todayIso } from '@/lib/i18n/date-format';
import { employeeDisplayName } from '@/lib/i18n/localized';
import type { LooseTranslator } from '@/lib/i18n/translator';
import type { ListParams } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';
import { decodeBuilderConfig, type BuilderField } from './builder/sources';
import { runBuilderQueryAll, validateBuilderConfig } from './builder/server';
import { columnField, REPORTS, reportDatasetKey, type ReportColumn, type ReportDefinition } from './definitions';
import { canExportReport, canOpenReportCenter, readReportFilters, REPORT_URL_KEYS, type ReportFilterState } from './filters';
import { loadEmployeeOptions, loadFilterOptions } from './queries';
import { fetchReportRows, sortableColumnIds, type ReportRow } from './registry';

/**
 * Export datasets of the reports module — one per report (`/api/export/report-<key>`) plus the
 * custom builder (`/api/export/report-builder?cfg=…`). They apply exactly the page's filters
 * (same parser), use the caller's RLS client and require `reports.export` + report access.
 */

type Row = ReportRow;

function pickLocalized(row: Row, base: string, locale: Locale): string | null {
  const primary = row[`${base}_${locale}`];
  const other = row[`${base}_${locale === 'ar' ? 'en' : 'ar'}`];
  const value = (typeof primary === 'string' && primary.trim() ? primary : typeof other === 'string' && other.trim() ? other : null) as
    | string
    | null;
  return value;
}

function translated(t: LooseTranslator, key: string, fallback: unknown): string | null {
  if (fallback === null || fallback === undefined || fallback === '') return null;
  return t.has(key) ? t(key) : String(fallback);
}

const TYPE_BY_KIND: Partial<Record<ReportColumn['kind'], ExportColumnType>> = {
  integer: 'integer',
  daysLeft: 'integer',
  decimal: 'number',
  days: 'number',
  percent: 'percent',
  date: 'date',
  datetime: 'datetime',
};

/** Report column → export column (localized text, translated enums/statuses, typed numbers/dates). */
export function reportExportColumn(col: ReportColumn, t: LooseTranslator, locale: Locale): ExportColumn<Row> {
  const field = columnField(col);
  const base: ExportColumn<Row> = {
    key: col.id,
    header: t(col.labelKey),
    width: col.width,
    type: TYPE_BY_KIND[col.kind] ?? 'text',
  };
  const empty = (v: string | null) => v ?? (col.emptyKey ? t(col.emptyKey) : null);
  switch (col.kind) {
    case 'employee':
      return {
        ...base,
        value: (r) => employeeDisplayName({ name_ar: r.name_ar as string, name_en: r.name_en as string }, locale) || null,
      };
    case 'user':
      return {
        ...base,
        value: (r) => pickLocalized(r, 'actor_name', locale) || (r.actor_email as string) || t('reports.view.system'),
      };
    case 'localized':
      return { ...base, value: (r) => empty(pickLocalized(r, field, locale)) };
    case 'status':
      return {
        ...base,
        value: (r) => translated(t, `statuses.${col.statusDomain}.${r[field]}`, r[field]),
      };
    case 'enum':
      return {
        ...base,
        value: (r) => translated(t, `enums.${col.enumKey}.${r[field]}`, r[field]),
      };
    case 'bucket':
      return {
        ...base,
        value: (r) => translated(t, `reports.buckets.${r[field]}`, r[field]),
      };
    case 'category':
      return {
        ...base,
        value: (r) => translated(t, `reports.categories.${r[field]}`, r[field]),
      };
    case 'sla':
      return {
        ...base,
        value: (r) => translated(t, `reports.sla.${r[field]}`, r[field]),
      };
    case 'hijri':
      return {
        ...base,
        value: (r) => (col.dateField && r[col.dateField] ? formatHijriDate(r[col.dateField] as string, locale) : null) || (r[field] as string | null),
      };
    case 'month':
      return {
        ...base,
        value: (r) => (r[field] ? formatMonthYear(r[field] as string, locale) : null),
      };
    default:
      return {
        ...base,
        value: (r) => (r[field] === undefined ? null : r[field]),
      };
  }
}

/** Human-readable filter lines for the PDF header (resolved names, localized dates). */
async function describeReportFilters(
  supabase: ServerSupabaseClient,
  def: ReportDefinition,
  state: ReportFilterState,
  t: LooseTranslator,
  locale: Locale,
): Promise<string[]> {
  const lines: string[] = [];
  if (def.dateRange && (state.dateFrom || state.dateTo)) {
    lines.push(`${t(`reports.filters.dateKinds.${def.dateRange.kind}`)}: ${formatDateRange(state.dateFrom, state.dateTo, locale)}`);
  }
  const keys = def.filters.filter((k) => state.values[k]?.length);
  if (!keys.length) return lines;
  const [options, employees] = await Promise.all([
    loadFilterOptions(supabase, keys, locale),
    state.values.employee?.length ? loadEmployeeOptions(supabase, state.values.employee, locale) : Promise.resolve([]),
  ]);
  for (const key of keys) {
    const values = state.values[key] ?? [];
    let labels: string[];
    switch (key) {
      case 'employee':
        labels = values.map((v) => employees.find((e) => e.value === v)?.label ?? v);
        break;
      case 'status':
        labels = values.map((v) => (def.status?.kind === 'status' ? (translated(t, `statuses.${def.status.domain}.${v}`, v) ?? v) : v));
        break;
      case 'bucket':
        labels = values.map((v) => translated(t, `reports.buckets.${v}`, v) ?? v);
        break;
      case 'category':
        labels = values.map((v) => translated(t, `reports.categories.${v}`, v) ?? v);
        break;
      case 'certificateType':
        labels = values.map((v) => translated(t, `enums.certificateType.${v}`, v) ?? v);
        break;
      default:
        labels = values.map((v) => options[key]?.find((o) => o.value === v)?.label ?? v);
    }
    lines.push(`${t(`reports.filters.${key}`)}: ${labels.join('، ')}`);
  }
  return lines;
}

/** Filter lines computed in `fetchRows` (same `params` object is later passed to `describeFilters`). */
const FILTER_LINES = new WeakMap<object, string[]>();
/** Builder export columns computed in `fetchRows`, keyed by the request's session object. */
const BUILDER_COLUMNS = new WeakMap<SessionContext, ExportColumn<Row>[]>();

function listGetter(params: ListParams): (key: string) => string | null {
  return (key) => params.filters[key]?.join(',') ?? null;
}

const reportDatasets: AnyExportDataset[] = REPORTS.map((def) =>
  defineDataset<Row>({
    key: reportDatasetKey(def.key),
    // Checked by the route before any query (403); `fetchRows` re-checks full report + export access.
    permission: def.exportPermission ?? 'reports.export',
    titleKey: `reports.items.${def.i18n}.title`,
    filterKeys: REPORT_URL_KEYS,
    allowedSorts: sortableColumnIds(def),
    defaultSort: def.defaultSort.id,
    defaultDir: def.defaultSort.desc ? 'desc' : 'asc',
    landscape: true,
    columns: (t, ctx) => def.columns.map((col) => reportExportColumn(col, t, ctx.locale)),
    fetchRows: async (supabase, params, ctx) => {
      // Report access + export rights on top of the dataset permission (e.g. User Activity needs audit.view).
      if (!canExportReport(ctx.session, def)) throw new ActionError('errors.forbidden');
      const state = readReportFilters(def, listGetter(params), todayIso());
      const rows = await fetchReportRows(supabase, def, state, { q: params.q, sort: params.sort, dir: params.dir }, ctx.locale, ctx.limit);
      try {
        FILTER_LINES.set(params, await describeReportFilters(supabase, def, state, ctx.t, ctx.locale));
      } catch {
        /* filter captions are cosmetic */
      }
      return rows;
    },
    describeFilters: (params) => FILTER_LINES.get(params) ?? [],
  }),
);

const BUILDER_TYPE: Partial<Record<BuilderField['type'], ExportColumnType>> = {
  number: 'number',
  date: 'date',
  datetime: 'datetime',
  boolean: 'boolean',
};

export function builderExportColumn(field: BuilderField, t: LooseTranslator): ExportColumn<Row> {
  const base: ExportColumn<Row> = {
    key: field.key,
    header: t(`reports.builder.fields.${field.labelId}`),
    type: BUILDER_TYPE[field.type] ?? 'text',
  };
  if (field.plain)
    return {
      ...base,
      type: 'text',
      value: (r) => (r[field.key] === null || r[field.key] === undefined ? null : String(r[field.key])),
    };
  if (field.type === 'enum')
    return {
      ...base,
      value: (r) => translated(t, `enums.${field.enumKey}.${r[field.key]}`, r[field.key]),
    };
  if (field.type === 'status')
    return {
      ...base,
      value: (r) => translated(t, `statuses.${field.statusDomain}.${r[field.key]}`, r[field.key]),
    };
  return base;
}

const builderDataset = defineDataset<Row>({
  key: 'report-builder',
  permission: 'reports.export',
  titleKey: 'reports.builder.exportTitle',
  filterKeys: ['cfg'],
  landscape: true,
  columns: (_t, ctx) => BUILDER_COLUMNS.get(ctx.session) ?? [],
  fetchRows: async (supabase, params, ctx) => {
    if (!canOpenReportCenter(ctx.session)) throw new ActionError('errors.forbidden');
    const validated = validateBuilderConfig(decodeBuilderConfig(params.filters.cfg?.[0]), ctx.session);
    BUILDER_COLUMNS.set(
      ctx.session,
      validated.fields.map((field) => builderExportColumn(field, ctx.t)),
    );
    const lines = [ctx.t(`reports.builder.sources.${validated.source.key}.title`)];
    const { dateField, dateFrom, dateTo } = validated.config;
    if (dateField && (dateFrom || dateTo)) {
      const field = validated.source.fields.find((x) => x.key === dateField);
      if (field) lines.push(`${ctx.t(`reports.builder.fields.${field.labelId}`)}: ${formatDateRange(dateFrom, dateTo, ctx.locale)}`);
    }
    if (validated.config.filters.length)
      lines.push(
        ctx.t('reports.builder.exportFilters', {
          count: validated.config.filters.length,
        }),
      );
    FILTER_LINES.set(params, lines);
    return runBuilderQueryAll(supabase, validated, ctx.locale, ctx.limit);
  },
  describeFilters: (params) => FILTER_LINES.get(params) ?? [],
});

export const datasets: AnyExportDataset[] = [...reportDatasets, builderDataset];
