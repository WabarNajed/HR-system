import type { SessionContext } from '@/lib/auth/session';
import type { Locale } from '@/lib/i18n/config';
import type { LooseTranslator } from '@/lib/i18n/translator';
import type { ListParams } from '@/lib/list-params';
import type { Permission } from '@/lib/permissions';
import type { ServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Export dataset contract. Each module declares its datasets in
 * `src/features/<module>/export-datasets.ts` (`export const datasets: ExportDataset[]`), all
 * registered in `src/lib/export/registry.ts` and served by `GET /api/export/[dataset]`.
 *
 *   export const datasets: ExportDataset<EmployeeExportRow>[] = [{
 *     key: 'employees',
 *     permission: 'employees.export',
 *     titleKey: 'employees.title',
 *     filterKeys: ['status', 'department'],
 *     allowedSorts: ['name', 'joining_date'],
 *     defaultSort: 'name',
 *     columns: (t) => [
 *       { key: 'employee_number', header: t('employees.fields.employeeNumber'), width: 14 },
 *       { key: 'name', header: t('common.name'), width: 28, value: (r) => employeeDisplayName(r, t.locale) },
 *       { key: 'joining_date', header: t('employees.fields.joiningDate'), type: 'date' },
 *     ],
 *     fetchRows: async (supabase, params) => { … .range(from, to) in pages … },
 *   }];
 */

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['xlsx', 'csv', 'pdf'];

/** Hard cap on exported rows (PostgREST returns ≤1000 per request on hosted — page with `.range()`). */
export const EXPORT_ROW_LIMIT = 20_000;

export type ExportColumnType = 'text' | 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean';

export type ExportColumn<Row = Record<string, unknown>> = {
  /** Row property (used when `value` is not given). */
  key: string;
  /** Translated header. */
  header: string;
  /** Excel column width in characters (default by type). */
  width?: number;
  type?: ExportColumnType;
  /** Derives the cell value (already localized for text). */
  value?: (row: Row) => unknown;
};

export type ExportContext = {
  session: SessionContext;
  locale: Locale;
  t: LooseTranslator;
  /** Organization currency for `currency` columns. */
  currency: string;
};

export type ExportDataset<Row = Record<string, unknown>> = {
  /** URL segment: `/api/export/<key>` — lowercase letters, digits, `_` or `-`. */
  key: string;
  /** Required permission (`module.action`), checked before any query. */
  permission: Permission;
  /** i18n key of the report title (file/sheet title). */
  titleKey: string;
  /** Allowed formats (default all). */
  formats?: readonly ExportFormat[];
  /** Filter keys read from the query string (same as the page's `parseListParams`). */
  filterKeys?: readonly string[];
  allowedSorts?: readonly string[];
  defaultSort?: string;
  defaultDir?: 'asc' | 'desc';
  /** PDF in landscape (default true). */
  landscape?: boolean;
  columns: (t: LooseTranslator, ctx: ExportContext) => ExportColumn<Row>[];
  /**
   * Loads rows with the user's RLS client applying `params` (search/filters/sort). Must respect
   * `limit` (≤ EXPORT_ROW_LIMIT) and page through `.range()` for large sets.
   */
  fetchRows: (supabase: ServerSupabaseClient, params: ListParams, ctx: ExportContext & { limit: number }) => Promise<Row[]>;
  /** Human-readable filter summary lines for the PDF header (translated). */
  describeFilters?: (params: ListParams, t: LooseTranslator) => string[];
};

/** Helper to keep dataset literals typed: `defineDataset<MyRow>({ … })`. */
export function defineDataset<Row>(dataset: ExportDataset<Row>): ExportDataset<Row> {
  return dataset;
}

/**
 * Pages through a PostgREST query builder factory until `limit` rows or exhaustion.
 *   await fetchAllPages((from, to) => supabase.from('employees').select('…').order('name_ar').range(from, to), limit)
 */
export async function fetchAllPages<Row>(
  query: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
  limit: number = EXPORT_ROW_LIMIT,
  pageSize = 1000,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize, limit) - 1;
    const { data, error } = await query(from, to);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

/** A dataset of any row type (module lists / the registry hold heterogeneous datasets). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExportDataset = ExportDataset<any>;
