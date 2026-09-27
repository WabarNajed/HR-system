'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ActionError, ok, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import type { SessionContext } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { addOutcomes, commitRows, emptyStats, finalizeReferences, type CommitEnv } from './lib/commit';
import { loadValidationContext, type DbClient } from './lib/context';
import { missingRequired, sanitizeMapping } from './lib/mapping';
import {
  applyOutcomes,
  deleteImportSource,
  fetchInFileReferenceRows,
  fetchPendingRows,
  importRowCounts,
  loadImportSource,
  saveValidation,
  type ImportSummary,
} from './lib/store';
import { defaultImportOptions, type ImportOptions, type ImportType } from './lib/types';
import { validateImport } from './lib/validate';
import { extractTable } from './lib/workbook';
import { canImportType, canUpdateExisting, importCapabilities } from './permissions';
import { countSkippedRows, inspectWorkbook, listImportRows, loadImport, mappingRecord } from './server/service';
import type { BatchResult, ImportRowsPage, ImportView, SheetInspection, ValidationView } from './types';

const BATCH_SIZE = 100;
const LEASE_MS = 90_000;

const idSchema = z.string().uuid();

async function client(): Promise<DbClient> {
  return (await createClient({ timeoutMs: 30_000 })) as unknown as DbClient;
}

/** Loads an import the actor may work on (type permission re-checked on every call). */
async function requireImport(ctx: SessionContext, db: DbClient, importId: string) {
  const imp = await loadImport(db, importId);
  if (!imp) throw new ActionError('dataManagement.errors.importNotFound');
  if (!canImportType(ctx, imp.type)) throw new ActionError('errors.forbidden');
  return imp;
}

function sanitizeOptions(ctx: SessionContext, type: ImportType, input: Partial<ImportOptions>): ImportOptions {
  const base = defaultImportOptions();
  const caps = importCapabilities(ctx);
  const merged: ImportOptions = { ...base, ...input };
  if (merged.existing === 'update' && !canUpdateExisting(ctx, type)) merged.existing = 'skip';
  if (!caps.settingsEdit) merged.createMissingMasterData = false;
  if (type !== 'employees') merged.professionAsJobTitle = false;
  return merged;
}

const REVALIDATE: Record<ImportType, string[]> = {
  employees: ['/employees', '/dashboard', '/leave', '/reports'],
  departments: ['/settings/departments', '/employees'],
  job_titles: ['/settings/job-titles', '/employees'],
  locations: ['/settings/locations', '/employees'],
  cost_centers: ['/settings/cost-centers'],
  public_holidays: ['/settings/public-holidays', '/leave'],
  leave_balances: ['/leave', '/dashboard'],
  dependents: ['/employees'],
  insurance: ['/employees', '/reports'],
  documents: ['/documents', '/employees', '/dashboard'],
};

/* ─── Sheet & header ──────────────────────────────────────────────────────── */

export const inspectImportAction = withAction(
  z.object({ importId: idSchema, sheetIndex: z.number().int().min(0).max(500), headerRow: z.number().int().min(0).max(1000), headerRows: z.union([z.literal(1), z.literal(2)]).optional() }),
  async (input, { ctx }) => {
    const db = await client();
    const imp = await requireImport(ctx, db, input.importId);
    if (imp.status !== 'uploaded' && imp.status !== 'validated') throw new ActionError('dataManagement.errors.importNotEditable');
    const source = await loadImportSource(db, imp.id);
    if (!source) throw new ActionError('dataManagement.errors.sourceExpired');
    return ok<SheetInspection>(inspectWorkbook(source, imp.type, { sheetIndex: input.sheetIndex, headerRow: input.headerRow, headerRows: input.headerRows }));
  },
  { scope: 'dataManagement.inspect' },
);

/* ─── Validation ──────────────────────────────────────────────────────────── */

const mappingSchema = z.array(z.object({ index: z.number().int().min(0).max(1000), label: z.string().max(300), target: z.string().max(80) })).max(200);
const optionsSchema = z.object({
  existing: z.enum(['update', 'skip']),
  createMissingMasterData: z.boolean(),
  professionAsJobTitle: z.boolean(),
  defaultEmploymentStatus: z.enum(['active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated']),
  leaveBalanceMode: z.enum(['available', 'carryover']),
  leaveYear: z.number().int().min(2000).max(2200),
});

export const validateImportAction = withAction(
  z.object({
    importId: idSchema,
    sheetIndex: z.number().int().min(0).max(500),
    headerRow: z.number().int().min(0).max(1000),
    headerRows: z.union([z.literal(1), z.literal(2)]),
    mapping: mappingSchema,
    options: optionsSchema,
  }),
  async (input, { ctx }) => {
    const db = await client();
    const imp = await requireImport(ctx, db, input.importId);
    if (imp.status !== 'uploaded' && imp.status !== 'validated') throw new ActionError('dataManagement.errors.importNotEditable');
    const source = await loadImportSource(db, imp.id);
    if (!source) throw new ActionError('dataManagement.errors.sourceExpired');
    const sheet = source.sheets[input.sheetIndex];
    if (!sheet) throw new ActionError('errors.validation');
    const table = extractTable(sheet, input.headerRow, input.headerRows);
    const mapping = sanitizeMapping(imp.type, table, input.mapping);
    if (missingRequired(imp.type, mapping).length) throw new ActionError('dataManagement.errors.missingRequired');
    const options = sanitizeOptions(ctx, imp.type, input.options);
    const caps = importCapabilities(ctx);
    const context = await loadValidationContext(db, imp.type, {
      leaveYear: options.leaveYear,
      can: { leaveEdit: caps.leaveEdit, personalDataEdit: caps.personalDataEdit, settingsEdit: caps.settingsEdit },
    });
    const result = validateImport({ type: imp.type, table, mapping, options, context });
    const summary: ImportSummary = {
      ...imp.summary,
      sheet_index: input.sheetIndex,
      sheet: sheet.name,
      header_row: table.headerRow,
      header_rows: table.headerRows,
      lease: null,
    };
    await saveValidation(db, imp.id, {
      rows: result.rows,
      totals: result.totals,
      mapping: mappingRecord(input.sheetIndex, input.headerRow, table.headerRows, mapping),
      options,
      summary,
    });
    const skipped = result.rows.filter((r) => r.status === 'skipped' || (r.status !== 'error' && r.action === 'skip')).length;
    return ok<ValidationView>({ totals: result.totals, skipped });
  },
  { scope: 'dataManagement.validate' },
);

/* ─── Rows (review table, history details) ────────────────────────────────── */

export const listImportRowsAction = withAction(
  z.object({
    importId: idSchema,
    filter: z.enum(['all', 'valid', 'warning', 'error', 'skipped', 'imported']),
    q: z.string().max(100).optional(),
    page: z.number().int().min(1).max(10_000),
    pageSize: z.number().int().min(5).max(100),
  }),
  async (input, { ctx }) => {
    const db = await client();
    const imp = await requireImport(ctx, db, input.importId);
    const { rows, total } = await listImportRows(db, imp, input);
    return ok<ImportRowsPage>({ rows, total, page: input.page, pageSize: input.pageSize });
  },
  { scope: 'dataManagement.rows' },
);

export const getImportAction = withAction(
  z.object({ importId: idSchema }),
  async (input, { ctx }) => {
    const db = await client();
    const imp = await requireImport(ctx, db, input.importId);
    const skipped = await countSkippedRows(db, imp.id);
    const { updatedAt: _updated, ...view } = imp;
    void _updated;
    return ok<ImportView & { skipped: number }>({ ...view, skipped });
  },
  { scope: 'dataManagement.get' },
);

/* ─── Run (batched) ───────────────────────────────────────────────────────── */

export const runImportBatchAction = withAction(
  z.object({ importId: idSchema, runnerId: z.string().min(8).max(64) }),
  async (input, { ctx }) => {
    const db = await client();
    const imp = await requireImport(ctx, db, input.importId);
    if (imp.status !== 'validated' && imp.status !== 'importing') throw new ActionError('dataManagement.errors.importNotEditable');
    const options = sanitizeOptions(ctx, imp.type, imp.options ?? {});
    if (options.existing === 'update' && !canUpdateExisting(ctx, imp.type)) throw new ActionError('errors.forbidden');

    // Lease: one runner at a time (optimistic update on updated_at).
    const lease = imp.summary.lease;
    const now = Date.now();
    if (lease && lease.runner !== input.runnerId && Date.parse(lease.until) > now) throw new ActionError('dataManagement.errors.importBusy');
    const claimed = await db
      .from('imports')
      .update({
        status: 'importing',
        summary: { ...imp.summary, lease: { runner: input.runnerId, until: new Date(now + LEASE_MS).toISOString() } } as never,
      })
      .eq('id', imp.id)
      .eq('updated_at', imp.updatedAt)
      .select('id');
    if (claimed.error) throw claimed.error;
    if (!claimed.data?.length) throw new ActionError('dataManagement.errors.importBusy');

    const env: CommitEnv = { client: db, mode: 'user', importId: imp.id, type: imp.type, options };
    const previous = imp.summary.result ?? { created: 0, updated: 0, skipped: 0, failed: 0, master_created: {} };
    const stats = { ...emptyStats(), created: previous.created, updated: previous.updated, skipped: previous.skipped, failed: previous.failed, masterCreated: { ...previous.master_created } };

    const batch = await fetchPendingRows(db, imp.id, BATCH_SIZE);
    if (batch.length) {
      const outcomes = await commitRows(env, batch, stats.masterCreated);
      await applyOutcomes(db, imp.id, batch, outcomes);
      addOutcomes(stats, outcomes);
    }
    const counts = await importRowCounts(db, imp.id);
    const done = counts.pending === 0;
    let result: NonNullable<ImportSummary['result']> = {
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      failed: stats.failed,
      master_created: stats.masterCreated,
      linked: previous.linked,
      unresolved: previous.unresolved,
    };
    let status: ImportView['status'] = 'importing';

    if (done) {
      const refField = imp.type === 'employees' ? 'manager' : imp.type === 'departments' ? 'parent' : null;
      if (refField) {
        const refs = await finalizeReferences(env, await fetchInFileReferenceRows(db, imp.id, refField));
        result = { ...result, linked: refs.linked, unresolved: refs.unresolved };
      }
      status = counts.imported === 0 && counts.error > 0 ? 'failed' : 'completed';
      const { error } = await db
        .from('imports')
        .update({
          status,
          imported_rows: counts.imported,
          error_rows: counts.error,
          completed_at: new Date().toISOString(),
          summary: { ...imp.summary, lease: null, result } as never,
        })
        .eq('id', imp.id);
      if (error) throw error;
      await deleteImportSource(db, imp.id);
      await logAuditEvent(
        {
          action: imp.type === 'employees' ? 'employee.import' : `import.${imp.type}`,
          entityType: 'import',
          entityId: imp.id,
          summary: `${imp.fileName} · ${result.created} created · ${result.updated} updated · ${counts.error} not imported`,
          changes: {
            file: imp.fileName,
            type: imp.type,
            rows: imp.totals.total,
            created: result.created,
            updated: result.updated,
            skipped: counts.skipped,
            not_imported: counts.error,
            master_created: result.master_created,
          },
        },
        db,
      );
      for (const path of [...REVALIDATE[imp.type], '/admin/data-management']) revalidatePath(path);
    } else {
      const { error } = await db
        .from('imports')
        .update({
          imported_rows: counts.imported,
          summary: { ...imp.summary, lease: { runner: input.runnerId, until: new Date(Date.now() + LEASE_MS).toISOString() }, result } as never,
        })
        .eq('id', imp.id);
      if (error) throw error;
    }

    return ok<BatchResult>({
      processed: batch.length,
      pending: counts.pending,
      imported: counts.imported,
      skipped: counts.skipped,
      failed: counts.error,
      done,
      status,
      result,
    });
  },
  { scope: 'dataManagement.run' },
);

/* ─── Cancel ──────────────────────────────────────────────────────────────── */

export const cancelImportAction = withAction(
  z.object({ importId: idSchema }),
  async (input, { ctx }) => {
    const db = await client();
    const imp = await requireImport(ctx, db, input.importId);
    if (imp.status !== 'uploaded' && imp.status !== 'validated') throw new ActionError('dataManagement.errors.importNotEditable');
    const { error } = await db
      .from('imports')
      .update({ status: 'cancelled', completed_at: new Date().toISOString(), summary: { ...imp.summary, lease: null } as never })
      .eq('id', imp.id);
    if (error) throw error;
    await deleteImportSource(db, imp.id);
    revalidatePath('/admin/data-management');
    return ok(undefined, 'dataManagement.toast.cancelled');
  },
  { scope: 'dataManagement.cancel' },
);
