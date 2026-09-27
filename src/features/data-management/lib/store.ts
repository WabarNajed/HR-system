/**
 * Persistence of an import (imports / import_sources / import_rows) — shared by the app (user's
 * RLS client) and the CLI (service role).
 */
import type { Json } from '@/types/database';
import type { CommitOutcome, CommitRow } from './commit';
import type { DbClient } from './context';
import type { ColumnMapping, ImportOptions, ImportType, Issue, ParsedWorkbook, RowResult, ValidationTotals } from './types';
import type { MappedRow } from './validate';
import { countDataRows } from './workbook';

export type ImportSummary = {
  file_size?: number;
  file_kind?: 'xlsx' | 'csv';
  encoding?: string;
  sheets?: Array<{ name: string; rows: number; hidden?: boolean }>;
  sheet_index?: number;
  sheet?: string;
  header_row?: number;
  header_rows?: number;
  actions?: Pick<ValidationTotals, 'create' | 'update' | 'skip'>;
  result?: { created: number; updated: number; skipped: number; failed: number; master_created: Record<string, number>; linked?: number; unresolved?: number };
  lease?: { runner: string; until: string } | null;
  source?: 'app' | 'cli';
};

export type ImportMappingRecord = {
  sheet_index: number;
  header_row: number;
  header_rows: number;
  columns: ColumnMapping[];
};

const json = (v: unknown) => v as Json;

export async function createImportRecord(
  client: DbClient,
  input: { type: ImportType; fileName: string; fileSize: number; workbook: ParsedWorkbook; source?: 'app' | 'cli' },
): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  const summary: ImportSummary = {
    file_size: input.fileSize,
    file_kind: input.workbook.kind,
    encoding: input.workbook.encoding,
    sheets: input.workbook.sheets.map((s) => ({ name: s.name, rows: countDataRows(s), hidden: s.hidden || undefined })),
    source: input.source ?? 'app',
  };
  const { error } = await client.from('imports').insert({
    id,
    import_type: input.type,
    file_name: input.fileName.slice(0, 255),
    status: 'uploaded',
    summary: json(summary),
  });
  if (error) throw error;
  const { error: srcError } = await client.from('import_sources').insert({
    import_id: id,
    file_kind: input.workbook.kind,
    file_size: input.fileSize,
    sheets: json(input.workbook.sheets),
  });
  if (srcError) {
    await client.from('imports').delete().eq('id', id);
    throw srcError;
  }
  return id;
}

export async function loadImportSource(client: DbClient, importId: string): Promise<ParsedWorkbook | null> {
  const { data, error } = await client.from('import_sources').select('file_kind, sheets').eq('import_id', importId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { kind: data.file_kind as ParsedWorkbook['kind'], sheets: data.sheets as unknown as ParsedWorkbook['sheets'] };
}

export async function deleteImportSource(client: DbClient, importId: string): Promise<void> {
  await client.from('import_sources').delete().eq('import_id', importId);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Replaces the import's rows with a fresh validation result and marks it `validated`. */
export async function saveValidation(
  client: DbClient,
  importId: string,
  input: { rows: RowResult[]; totals: ValidationTotals; mapping: ImportMappingRecord; options: ImportOptions; summary: ImportSummary },
): Promise<void> {
  const { error: delError } = await client.from('import_rows').delete().eq('import_id', importId);
  if (delError) throw delError;
  for (const part of chunk(input.rows, 500)) {
    const { error } = await client.from('import_rows').insert(
      part.map((r) => ({
        import_id: importId,
        row_number: r.rowNumber,
        raw: json(r.raw),
        mapped: json(r.mapped),
        status: r.status,
        errors: json(r.errors),
        warnings: json(r.warnings),
      })),
    );
    if (error) throw error;
  }
  const { error } = await client
    .from('imports')
    .update({
      status: 'validated',
      total_rows: input.totals.total,
      valid_rows: input.totals.valid,
      warning_rows: input.totals.warning,
      error_rows: input.totals.error,
      imported_rows: 0,
      mapping: json(input.mapping),
      options: json(input.options),
      summary: json({ ...input.summary, actions: { create: input.totals.create, update: input.totals.update, skip: input.totals.skip } }),
    })
    .eq('id', importId);
  if (error) throw error;
}

export type PendingRow = CommitRow & { warnings: Issue[] };

/** Next rows to write (validated, not yet processed), in file order. */
export async function fetchPendingRows(client: DbClient, importId: string, limit: number): Promise<PendingRow[]> {
  const { data, error } = await client
    .from('import_rows')
    .select('id, row_number, mapped, warnings')
    .eq('import_id', importId)
    .in('status', ['valid', 'warning'])
    .order('row_number')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, row_number: r.row_number, mapped: r.mapped as unknown as MappedRow, warnings: (r.warnings as unknown as Issue[]) ?? [] }));
}

export async function countPendingRows(client: DbClient, importId: string): Promise<number> {
  const { count, error } = await client
    .from('import_rows')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', importId)
    .in('status', ['valid', 'warning']);
  if (error) throw error;
  return count ?? 0;
}

/** Stores per-row results (bulk upsert by id). */
export async function applyOutcomes(client: DbClient, importId: string, rows: readonly PendingRow[], outcomes: readonly CommitOutcome[]): Promise<void> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const payload = outcomes.map((o) => {
    const row = byId.get(o.rowId)!;
    const errors = o.issues.filter((i) => i.level === 'error');
    const warnings = [...row.warnings, ...o.issues.filter((i) => i.level !== 'error')];
    return {
      id: o.rowId,
      import_id: importId,
      row_number: o.rowNumber,
      status: o.status,
      entity_id: o.entityId,
      errors: json(errors),
      warnings: json(warnings),
    };
  });
  for (const part of chunk(payload, 500)) {
    const { error } = await client.from('import_rows').upsert(part, { onConflict: 'id' });
    if (error) throw error;
  }
}

/** Counts rows by final status for the imports row. */
export async function importRowCounts(client: DbClient, importId: string): Promise<{ imported: number; skipped: number; error: number; pending: number }> {
  const count = async (statuses: string[]) => {
    const { count: c, error } = await client.from('import_rows').select('id', { count: 'exact', head: true }).eq('import_id', importId).in('status', statuses);
    if (error) throw error;
    return c ?? 0;
  };
  const [imported, skipped, error, pending] = await Promise.all([count(['imported']), count(['skipped']), count(['error']), count(['valid', 'warning'])]);
  return { imported, skipped, error, pending };
}

/** Imported rows whose `refField` points at another row of the same file (final reference pass). */
export async function fetchInFileReferenceRows(
  client: DbClient,
  importId: string,
  refField: 'manager' | 'parent',
): Promise<Array<{ entity_id: string | null; mapped: MappedRow }>> {
  const out: Array<{ entity_id: string | null; mapped: MappedRow }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('import_rows')
      .select('entity_id, mapped')
      .eq('import_id', importId)
      .eq('status', 'imported')
      .eq(`mapped->refs->${refField}->>kind`, 'file')
      .order('row_number')
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.push({ entity_id: r.entity_id, mapped: r.mapped as unknown as MappedRow });
    if (!data || data.length < 1000) break;
  }
  return out;
}
