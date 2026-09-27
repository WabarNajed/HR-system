import 'server-only';

import { rankSheets } from '../lib/analyze';
import type { DbClient } from '../lib/context';
import { suggestMapping } from '../lib/mapping';
import { columnLetter } from '../lib/normalize';
import type { ImportSummary } from '../lib/store';
import type { ColumnMapping, ImportOptions, ImportType, Issue, JsonCell, ParsedWorkbook, RowAction, RowStatus } from '../lib/types';
import type { MappedRow } from '../lib/validate';
import { cellText, isBlank } from '../lib/values';
import { extractTable, previewGrid } from '../lib/workbook';
import type { ImportRowView, ImportStatus, ImportView, RowFilter, SheetInspection } from '../types';

/** Builds the sheet/header/mapping inspection for the wizard. */
export function inspectWorkbook(
  workbook: ParsedWorkbook,
  type: ImportType,
  choice: { sheetIndex?: number; headerRow?: number; headerRows?: 1 | 2 } = {},
): SheetInspection {
  const ranked = rankSheets(workbook, type);
  const visible = ranked.filter((s) => !s.hidden && s.rows > 0);
  const pool = visible.length ? visible : ranked;
  const best = pool.reduce((b, s) => (s.score > b.score ? s : b), pool[0]!);
  const sheetIndex = choice.sheetIndex !== undefined && ranked[choice.sheetIndex] ? choice.sheetIndex : best.index;
  const sheet = workbook.sheets[sheetIndex]!;
  const headerRow =
    choice.headerRow !== undefined && choice.headerRow >= 0 && choice.headerRow < Math.max(sheet.rows.length, 1) && choice.sheetIndex === sheetIndex
      ? choice.headerRow
      : ranked[sheetIndex]!.headerRow;
  const table = extractTable(sheet, headerRow, choice.headerRows);
  const suggestions = suggestMapping(type, table);
  const columns = suggestions.map((s) => {
    const values = table.rows.map((r) => r.cells[s.index] ?? null).filter((v) => !isBlank(v));
    return {
      ...s,
      letter: columnLetter(s.index),
      filled: values.length,
      samples: Array.from(new Set(values.slice(0, 40).map((v) => String(cellText(v) ?? '').slice(0, 60)))).slice(0, 3),
    };
  });
  const previewRows = Math.max(12, Math.min(headerRow + 6, 30));
  return {
    sheets: ranked.map((s) => ({ index: s.index, name: s.name, rows: s.rows, hidden: s.hidden, score: s.score })),
    sheetIndex,
    headerRow,
    headerRows: table.headerRows === 2 ? 2 : 1,
    preview: previewGrid(sheet, previewRows, 14).map((r) => r.map((c) => c.slice(0, 60))),
    records: table.rows.length,
    skipped: { blank: table.skippedBlank, repeated: table.skippedRepeatedHeader, summary: table.skippedSummary },
    columns,
  };
}

/* ─── Imports ─────────────────────────────────────────────────────────────── */

type ImportRowDb = {
  id: string;
  import_type: string;
  file_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  imported_rows: number;
  mapping: unknown;
  options: unknown;
  summary: unknown;
  updated_at: string;
};

const IMPORT_COLUMNS =
  'id, import_type, file_name, status, created_at, completed_at, created_by, total_rows, valid_rows, warning_rows, error_rows, imported_rows, mapping, options, summary, updated_at';

export async function profileNames(client: DbClient, ids: readonly (string | null)[]): Promise<Map<string, { name: string | null; email: string | null }>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => Boolean(x))));
  const out = new Map<string, { name: string | null; email: string | null }>();
  if (!unique.length) return out;
  const { data } = await client.from('profiles').select('id, full_name, email').in('id', unique);
  for (const p of data ?? []) out.set(p.id, { name: p.full_name, email: p.email });
  return out;
}

export function toImportView(row: ImportRowDb, names: Map<string, { name: string | null; email: string | null }>): ImportView {
  const mapping = row.mapping && typeof row.mapping === 'object' && 'columns' in (row.mapping as object) ? (row.mapping as ImportView['mapping']) : null;
  const options = row.options && typeof row.options === 'object' && 'existing' in (row.options as object) ? (row.options as ImportOptions) : null;
  return {
    id: row.id,
    type: row.import_type as ImportType,
    fileName: row.file_name,
    status: row.status as ImportStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    createdBy: row.created_by ? (names.get(row.created_by) ?? null) : null,
    totals: { total: row.total_rows, valid: row.valid_rows, warning: row.warning_rows, error: row.error_rows, imported: row.imported_rows },
    summary: (row.summary as ImportSummary) ?? {},
    options,
    mapping,
  };
}

export async function loadImport(client: DbClient, id: string): Promise<(ImportView & { updatedAt: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await client.from('imports').select(IMPORT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const names = await profileNames(client, [data.created_by]);
  return { ...toImportView(data as ImportRowDb, names), updatedAt: data.updated_at };
}

/* ─── Rows ────────────────────────────────────────────────────────────────── */

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null;
}

/** Title / subtitle shown for a row in the review tables. */
export function rowLabel(type: ImportType, mapped: MappedRow | null, raw: Record<string, JsonCell>): { title: string; subtitle: string | null } {
  const label = baseRowLabel(type, mapped, raw);
  return label.title ? label : { title: label.subtitle ?? '', subtitle: null };
}

function baseRowLabel(type: ImportType, mapped: MappedRow | null, raw: Record<string, JsonCell>): { title: string; subtitle: string | null } {
  const v = mapped?.values ?? {};
  const firstRaw = Object.values(raw).map((x) => cellText(x)).find(Boolean) ?? '';
  switch (type) {
    case 'employees':
      return {
        title: text(v.name_ar) ?? text(v.name_en) ?? '',
        subtitle: [text(v.employee_number), text(v.national_id)].filter(Boolean).join(' · ') || null,
      };
    case 'departments':
    case 'job_titles':
    case 'locations':
    case 'cost_centers':
      return { title: text(v.name_ar) ?? text(v.name_en) ?? firstRaw, subtitle: text(v.code) };
    case 'public_holidays':
      return { title: text(v.name_ar) ?? text(v.name_en) ?? firstRaw, subtitle: [text(v.start_date), text(v.end_date)].filter(Boolean).join(' → ') || null };
    case 'leave_balances':
      return {
        title: mapped?.employee?.label ?? text(v.employee_name) ?? text(v.employee_number) ?? text(v.employee_national_id) ?? firstRaw,
        subtitle: [mapped?.refs?.leave_type && 'label' in mapped.refs.leave_type ? mapped.refs.leave_type.label : text(v.leave_type), text(v.year), text(v.opening_balance)].filter(Boolean).join(' · ') || null,
      };
    case 'dependents':
      return { title: text(v.name_ar) ?? text(v.name_en) ?? firstRaw, subtitle: mapped?.employee?.label ?? text(v.employee_number) ?? text(v.employee_national_id) };
    case 'insurance':
      return { title: mapped?.employee?.label ?? text(v.employee_number) ?? firstRaw, subtitle: [text(v.provider), text(v.member_number) ?? text(v.policy_number)].filter(Boolean).join(' · ') || null };
    case 'documents':
      return { title: mapped?.employee?.label ?? text(v.employee_number) ?? firstRaw, subtitle: [text(v.document_type), text(v.document_number)].filter(Boolean).join(' · ') || null };
  }
}

const SEARCH_KEYS = ['name_ar', 'name_en', 'national_id', 'employee_number', 'employee_national_id', 'employee_name', 'code', 'document_number', 'member_number', 'passport_number'];

export async function listImportRows(
  client: DbClient,
  imp: Pick<ImportView, 'id' | 'type'>,
  params: { filter: RowFilter; q?: string; page: number; pageSize: number },
): Promise<{ rows: ImportRowView[]; total: number }> {
  let query = client
    .from('import_rows')
    .select('id, row_number, status, raw, mapped, errors, warnings, entity_id', { count: 'exact' })
    .eq('import_id', imp.id);
  switch (params.filter) {
    case 'valid':
    case 'warning':
    case 'error':
    case 'imported':
      query = query.eq('status', params.filter);
      break;
    case 'skipped':
      query = query.or('status.eq.skipped,and(status.in.(valid,warning),mapped->>action.eq.skip)');
      break;
    default:
      break;
  }
  const q = (params.q ?? '').replace(/[,()"'*%\\]/g, ' ').trim();
  if (q) {
    const parts = SEARCH_KEYS.map((k) => `mapped->values->>${k}.ilike.*${q}*`);
    if (/^\d{1,6}$/.test(q)) parts.push(`row_number.eq.${q}`);
    query = query.or(parts.join(','));
  }
  const from = (params.page - 1) * params.pageSize;
  const { data, error, count } = await query.order('row_number').range(from, from + params.pageSize - 1);
  if (error) throw error;
  const rows: ImportRowView[] = (data ?? []).map((r) => {
    const mapped = (r.mapped as unknown as MappedRow | null) ?? null;
    const raw = (r.raw as Record<string, JsonCell>) ?? {};
    const label = rowLabel(imp.type, mapped, raw);
    return {
      id: r.id,
      rowNumber: r.row_number,
      status: r.status as RowStatus,
      action: (mapped?.action ?? 'skip') as RowAction,
      title: label.title,
      subtitle: label.subtitle,
      errors: (r.errors as unknown as Issue[]) ?? [],
      warnings: (r.warnings as unknown as Issue[]) ?? [],
      raw,
      values: mapped?.values ?? {},
      extra: mapped?.extra ?? {},
      entityId: r.entity_id,
    };
  });
  return { rows, total: count ?? rows.length };
}

export async function countSkippedRows(client: DbClient, importId: string): Promise<number> {
  const { count } = await client
    .from('import_rows')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', importId)
    .or('status.eq.skipped,and(status.in.(valid,warning),mapped->>action.eq.skip)');
  return count ?? 0;
}

export function mappingRecord(sheetIndex: number, headerRow: number, headerRows: number, columns: ColumnMapping[]) {
  return { sheet_index: sheetIndex, header_row: headerRow, header_rows: headerRows, columns };
}
