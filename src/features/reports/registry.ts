import 'server-only';

import type { Locale } from '@/lib/i18n/config';
import { fetchAllPages } from '@/lib/export/types';
import { toIlikePattern } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { columnField, getReportDefinition, REPORTS, type ReportColumn, type ReportDefinition } from './definitions';
import { toSqlFilters, type ReportFilterState } from './filters';

/**
 * Report registry (server half): how each report reads its rows and summary. All reads use the
 * caller's RLS client and the security-invoker SQL functions of migration
 * `20260928090000_reports_functions.sql` — managers therefore only ever see their team.
 *
 *   report = definition (definitions.ts: key, group, i18n, permissions, filters, KPIs, charts, columns)
 *          + source (below: SQL function, fixed filters, search fields)
 */

type RowSource = {
  /** Row function (`public.report_*_rows`). */
  fn: string;
  /** Extra positional args besides `p_filters`. */
  args?: Record<string, string>;
  /** Fixed SQL filters (scope / date_field) merged over the user's filters. */
  fixed?: Record<string, string>;
  /** Row id field. */
  rowId: string;
  /** Columns searched by the table's `q` (ilike). */
  search?: readonly string[];
};

const EMPLOYEE_SEARCH = ['name_ar', 'name_en', 'employee_number'] as const;
const REQUEST_SEARCH = ['request_number', 'name_ar', 'name_en', 'employee_number', 'type_ar', 'type_en'] as const;

const SOURCES: Record<string, RowSource> = {
  'employee-master': { fn: 'report_employee_rows', fixed: { scope: 'records', date_field: 'joining_date' }, rowId: 'id', search: [...EMPLOYEE_SEARCH, 'company_email'] },
  headcount: { fn: 'report_headcount_trend', rowId: 'month' },
  'employees-by-department': { fn: 'report_employee_breakdown', args: { p_dimension: 'department' }, rowId: 'group_key', search: ['label_ar', 'label_en'] },
  'employees-by-nationality': { fn: 'report_employee_breakdown', args: { p_dimension: 'nationality' }, rowId: 'group_key', search: ['label_ar', 'label_en'] },
  'employees-by-job-title': { fn: 'report_employee_breakdown', args: { p_dimension: 'job_title' }, rowId: 'group_key', search: ['label_ar', 'label_en'] },
  'new-joiners': { fn: 'report_employee_rows', fixed: { scope: 'records', date_field: 'joining_date' }, rowId: 'id', search: EMPLOYEE_SEARCH },
  leavers: { fn: 'report_employee_rows', fixed: { scope: 'leavers', date_field: 'termination_date' }, rowId: 'id', search: EMPLOYEE_SEARCH },
  'contract-expiry': { fn: 'report_expiry_rows', args: { p_kind: 'contract' }, rowId: 'row_id', search: EMPLOYEE_SEARCH },
  'iqama-expiry': { fn: 'report_expiry_rows', args: { p_kind: 'iqama' }, rowId: 'row_id', search: [...EMPLOYEE_SEARCH, 'reference'] },
  'passport-expiry': { fn: 'report_expiry_rows', args: { p_kind: 'passport' }, rowId: 'row_id', search: [...EMPLOYEE_SEARCH, 'reference'] },
  'insurance-expiry': {
    fn: 'report_expiry_rows',
    args: { p_kind: 'insurance' },
    rowId: 'row_id',
    search: [...EMPLOYEE_SEARCH, 'reference', 'provider', 'dependent_name_ar', 'dependent_name_en'],
  },
  'leave-balance': { fn: 'report_leave_balance_rows', rowId: 'id', search: [...EMPLOYEE_SEARCH, 'leave_type_ar', 'leave_type_en'] },
  'leave-usage': { fn: 'report_leave_rows', rowId: 'id', search: [...EMPLOYEE_SEARCH, 'request_number', 'leave_type_ar', 'leave_type_en'] },
  'hr-requests': { fn: 'report_request_rows', fixed: { scope: 'all', date_field: 'submitted' }, rowId: 'id', search: REQUEST_SEARCH },
  'open-requests': { fn: 'report_request_rows', fixed: { scope: 'open', date_field: 'submitted' }, rowId: 'id', search: REQUEST_SEARCH },
  'completed-requests': { fn: 'report_request_rows', fixed: { scope: 'completed', date_field: 'resolved' }, rowId: 'id', search: REQUEST_SEARCH },
  'rejected-requests': { fn: 'report_request_rows', fixed: { scope: 'rejected', date_field: 'resolved' }, rowId: 'id', search: REQUEST_SEARCH },
  'overdue-requests': { fn: 'report_request_rows', fixed: { scope: 'overdue', date_field: 'submitted' }, rowId: 'id', search: REQUEST_SEARCH },
  'sla-performance': { fn: 'report_sla_rows', rowId: 'request_type_id', search: ['type_ar', 'type_en'] },
  'certificates-issued': { fn: 'report_certificate_rows', rowId: 'id', search: [...EMPLOYEE_SEARCH, 'certificate_number', 'request_number'] },
  'user-activity': { fn: 'report_user_activity_rows', rowId: 'actor_key', search: ['actor_name', 'actor_email', 'employee_number'] },
};

for (const def of REPORTS) {
  if (!SOURCES[def.key]) throw new Error(`[reports] missing row source for "${def.key}"`);
}

export type ReportRow = Record<string, unknown>;

export type ReportSummary = {
  kpis: Record<string, number | string | null>;
  charts: Record<string, Array<Record<string, unknown>>>;
};

export type TableQuery = {
  q: string;
  sort: string | null;
  dir: 'asc' | 'desc';
  from: number;
  to: number;
};

/** Row fields a column reads (select list = exactly what the screen/export shows). */
function columnFields(col: ReportColumn): string[] {
  const field = columnField(col);
  switch (col.kind) {
    case 'employee':
      return ['employee_id', 'name_ar', 'name_en', 'employee_number'];
    case 'localized':
      return [`${field}_ar`, `${field}_en`];
    case 'user':
      return ['actor_id', 'actor_name', 'actor_email', 'employee_number'];
    case 'request':
      return [field, col.linkField ?? 'id'];
    default:
      return [field];
  }
}

/** Server-side sort column for a table column id in the given locale (null when not sortable). */
export function sortColumn(def: ReportDefinition, id: string | null, locale: Locale): string | null {
  if (!id) return null;
  const col = def.columns.find((c) => c.id === id);
  if (!col || col.sortable === false) return null;
  const field = columnField(col);
  switch (col.kind) {
    case 'employee':
      return locale === 'ar' ? 'name_ar' : 'name_en';
    case 'localized':
      return `${field}_${locale}`;
    case 'user':
      return 'actor_name';
    default:
      return field;
  }
}

export function sortableColumnIds(def: ReportDefinition): string[] {
  return def.columns.filter((c) => c.sortable !== false).map((c) => c.id);
}

function selectList(def: ReportDefinition, source: RowSource): string {
  const fields = new Set<string>([source.rowId]);
  for (const col of def.columns) for (const f of columnFields(col)) fields.add(f);
  // Links + the employee id used by drill-downs.
  if (def.columns.some((c) => c.kind === 'employee')) fields.add('employee_id');
  return Array.from(fields).join(',');
}

function rpcArgs(def: ReportDefinition, state: ReportFilterState): Record<string, unknown> {
  const source = SOURCES[def.key]!;
  return { ...(source.args ?? {}), p_filters: { ...toSqlFilters(state), ...(source.fixed ?? {}) } };
}

type LooseQuery = {
  select: (cols: string) => LooseQuery;
  or: (filter: string) => LooseQuery;
  order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => LooseQuery;
  range: (from: number, to: number) => PromiseLike<{ data: ReportRow[] | null; error: unknown; count: number | null }>;
};

/** Dynamic RPC call (function names come from the fixed SOURCES table, never from the client). */
function rpc(supabase: ServerSupabaseClient, fn: string, args: Record<string, unknown>, count = false): LooseQuery {
  const call = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>, opts?: { count?: 'exact' }) => LooseQuery;
  return call.call(supabase, fn, args, count ? { count: 'exact' } : undefined);
}

function applyQuery(query: LooseQuery, def: ReportDefinition, source: RowSource, table: Omit<TableQuery, 'from' | 'to'>, locale: Locale): LooseQuery {
  let q = query.select(selectList(def, source));
  if (table.q && source.search?.length) {
    const pattern = toIlikePattern(table.q);
    q = q.or(source.search.map((c) => `${c}.ilike.${pattern}`).join(','));
  }
  const sort = sortColumn(def, table.sort, locale) ?? sortColumn(def, def.defaultSort.id, locale);
  const ascending = table.sort && sortColumn(def, table.sort, locale) ? table.dir === 'asc' : !def.defaultSort.desc;
  if (sort) q = q.order(sort, { ascending, nullsFirst: false });
  // Stable pagination.
  if (sort !== source.rowId) q = q.order(source.rowId, { ascending: true });
  return q;
}

export function getReport(key: string): ReportDefinition | null {
  return getReportDefinition(key);
}

/** One page of detail rows + the total count (server-side pagination). */
export async function fetchReportPage(
  supabase: ServerSupabaseClient,
  def: ReportDefinition,
  state: ReportFilterState,
  table: TableQuery,
  locale: Locale,
): Promise<{ rows: ReportRow[]; total: number }> {
  const source = SOURCES[def.key]!;
  const { data, error, count } = await applyQuery(rpc(supabase, source.fn, rpcArgs(def, state), true), def, source, table, locale).range(
    table.from,
    table.to,
  );
  if (error) throw error;
  return { rows: (data ?? []).map((r) => ({ ...r, __rowId: r[source.rowId] })), total: count ?? data?.length ?? 0 };
}

/** All rows (up to `limit`) — aggregate tables and exports. */
export async function fetchReportRows(
  supabase: ServerSupabaseClient,
  def: ReportDefinition,
  state: ReportFilterState,
  table: Omit<TableQuery, 'from' | 'to'>,
  locale: Locale,
  limit: number,
): Promise<ReportRow[]> {
  const source = SOURCES[def.key]!;
  const args = rpcArgs(def, state);
  const rows = await fetchAllPages<ReportRow>((from, to) => applyQuery(rpc(supabase, source.fn, args), def, source, table, locale).range(from, to), limit);
  return rows.map((r) => ({ ...r, __rowId: r[source.rowId] }));
}

/** KPI values + chart series. */
export async function fetchReportSummary(supabase: ServerSupabaseClient, def: ReportDefinition, state: ReportFilterState): Promise<ReportSummary> {
  const source = SOURCES[def.key]!;
  const { data, error } = await supabase.rpc('report_summary', {
    p_report: def.key,
    p_filters: { ...toSqlFilters(state), ...(source.fixed ?? {}) } as never,
  });
  if (error) throw error;
  const value = (data ?? {}) as Partial<ReportSummary>;
  return { kpis: value.kpis ?? {}, charts: value.charts ?? {} };
}

/** Preview metrics for the catalog cards (one RPC, RLS scoped). */
export async function fetchCatalogStats(supabase: ServerSupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('report_catalog_stats');
  if (error) throw error;
  return (data ?? {}) as Record<string, number>;
}
