/**
 * Employee import from the command line (same pipeline as Administration › Data management).
 *
 *   pnpm import:employees "<file.xlsx|csv>" [--dry-run] [--update-existing] [--create-job-titles]
 *                         [--sheet <name|number>] [--no-create-master-data] [--leave-mode available|carryover]
 *                         [--leave-year 2026] [--status active] [--report errors.xlsx] [--locale ar|en] [--yes]
 *
 *   --dry-run               analyse and validate only; nothing is written (combine with --report)
 *   --update-existing       update employees matched by employee number or Iqama (default: skip them)
 *   --create-job-titles     use the Iqama profession as job title when there is no job title column
 *                           (existing titles are matched, missing ones created)
 *   --no-create-master-data do not create departments / job titles / locations named in the file
 *   --leave-mode            "available" (default): the Leave Balance column is the current balance
 *                           (opening = value, entitlement = 0); "carryover": opening = value + yearly entitlement
 *   --leave-year            leave balance year (default: current year)
 *   --status                employment status for new employees without a status column (default: active)
 *   --report                write an XLSX error report (rows with errors or warnings)
 *   --yes                   do not ask for confirmation
 *
 * Uses the service role from .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and records the
 * import in `imports` / `import_rows` exactly like the web wizard, plus an `employee.import` audit event.
 * No login accounts are created for imported employees.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { analyzeWorkbook } from '../src/features/data-management/lib/analyze';
import { cliEnv, color, pad, parseArgs, serviceClient } from '../src/features/data-management/lib/cli';
import { addOutcomes, commitRows, emptyStats, finalizeReferences, type CommitEnv } from '../src/features/data-management/lib/commit';
import { loadValidationContext } from '../src/features/data-management/lib/context';
import { buildErrorReport } from '../src/features/data-management/lib/error-report';
import { suggestMapping } from '../src/features/data-management/lib/mapping';
import { fieldName, issueText, msg, type MessageLocale } from '../src/features/data-management/lib/messages';
import {
  applyOutcomes,
  createImportRecord,
  deleteImportSource,
  fetchInFileReferenceRows,
  fetchPendingRows,
  importRowCounts,
  saveValidation,
  type ImportSummary,
} from '../src/features/data-management/lib/store';
import { defaultImportOptions, EXTRA, IGNORE, type ImportOptions } from '../src/features/data-management/lib/types';
import { validateImport } from '../src/features/data-management/lib/validate';
import { extractTable, parseWorkbook, WorkbookError } from '../src/features/data-management/lib/workbook';

const STATUSES = ['active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated'] as const;

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^(y|yes|نعم)$/i.test(answer.trim());
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const file = positional[0];
  if (!file || flags.help) {
    console.log('Usage: pnpm import:employees "<file.xlsx|csv>" [--dry-run] [--update-existing] [--create-job-titles] [--sheet <name|number>] [--report errors.xlsx] [--yes]');
    process.exit(file ? 0 : 1);
  }
  const dryRun = Boolean(flags['dry-run']);
  const locale: MessageLocale = flags.locale === 'ar' ? 'ar' : 'en';
  const status = typeof flags.status === 'string' ? flags.status : 'active';
  if (!(STATUSES as readonly string[]).includes(status)) throw new Error(`--status must be one of ${STATUSES.join(', ')}`);
  const options: ImportOptions = {
    ...defaultImportOptions(),
    existing: flags['update-existing'] ? 'update' : 'skip',
    professionAsJobTitle: Boolean(flags['create-job-titles']),
    createMissingMasterData: !flags['no-create-master-data'],
    defaultEmploymentStatus: status as ImportOptions['defaultEmploymentStatus'],
    leaveBalanceMode: flags['leave-mode'] === 'carryover' ? 'carryover' : 'available',
    leaveYear: typeof flags['leave-year'] === 'string' ? Number(flags['leave-year']) : new Date().getFullYear(),
  };
  if (!Number.isInteger(options.leaveYear) || options.leaveYear < 2000 || options.leaveYear > 2200) throw new Error('--leave-year must be a year');

  const { client, url } = serviceClient(cliEnv());
  const bytes = readFileSync(file);
  const fileName = basename(file);
  let workbook;
  try {
    workbook = await parseWorkbook(bytes, fileName);
  } catch (error) {
    if (error instanceof WorkbookError) throw new Error(msg('en', `dataManagement.errors.${error.code}`));
    throw error;
  }

  let sheetArg: number | string | undefined;
  if (typeof flags.sheet === 'string') sheetArg = /^\d+$/.test(flags.sheet) ? Number(flags.sheet) - 1 : flags.sheet;
  const analysis = analyzeWorkbook(workbook, 'employees', { sheet: sheetArg });
  const sheetIndex = analysis.selected;
  const candidate = analysis.sheets[sheetIndex]!;
  const sheet = workbook.sheets[sheetIndex]!;
  const table = extractTable(sheet, candidate.headerRow);
  const mapping = suggestMapping('employees', table);

  console.log('');
  console.log(color.bold(`Import employees from ${fileName}`) + color.dim(`  → ${url}`));
  console.log(`Sheet "${sheet.name}", header row ${table.headerRow}, ${table.rows.length} records`);
  console.log('');
  for (const m of mapping) {
    const target = m.target === EXTRA ? color.dim('extra_data') : m.target === IGNORE ? color.dim('ignored') : fieldName('employees', m.target, 'en');
    console.log(`  ${pad(m.label, 34)} → ${pad(target, 32)} ${m.confidence ? m.confidence.toFixed(2) : ''}`);
  }
  if (analysis.analysis.missingRequired.length) {
    throw new Error(`Required columns not found: ${analysis.analysis.missingRequired.map((g) => g.map((k) => fieldName('employees', k, 'en')).join(' or ')).join('; ')}`);
  }

  const context = await loadValidationContext(client, 'employees', { leaveYear: options.leaveYear });
  const result = validateImport({ type: 'employees', table, mapping, options, context });
  const t = result.totals;
  console.log('');
  console.log(
    `Validation: ${t.total} rows · ${color.green(`${t.valid} valid`)} · ${color.yellow(`${t.warning} with warnings`)} · ${color.red(`${t.error} with errors`)}` +
      ` → create ${t.create}, update ${t.update}, skip ${t.skip}`,
  );
  const problems = result.rows.filter((r) => r.errors.length || r.warnings.some((w) => w.level === 'warning'));
  for (const r of problems.slice(0, 25)) {
    const lines = [...r.errors, ...r.warnings.filter((w) => w.level === 'warning')].map((i) => issueText(i, 'employees', 'en'));
    console.log(`  row ${pad(r.rowNumber, 5)} ${r.status === 'error' ? color.red('error  ') : color.yellow('warning')} ${lines.join(' | ')}`);
  }
  if (problems.length > 25) console.log(color.dim(`  … ${problems.length - 25} more (use --report to get all of them)`));

  const writeReport = async (rows: typeof result.rows, imported: number) => {
    if (typeof flags.report !== 'string') return;
    const buffer = await buildErrorReport({
      locale,
      type: 'employees',
      fileName,
      createdAt: new Date().toISOString(),
      columns: table.columns.map((c) => c.label),
      rows: rows
        .filter((r) => r.status === 'error' || r.warnings.some((w) => w.level === 'warning'))
        .map((r) => ({ row_number: r.rowNumber, status: r.status, raw: r.raw, errors: r.errors, warnings: r.warnings })),
      totals: { total: t.total, valid: t.valid, warning: t.warning, error: t.error, imported },
    });
    writeFileSync(flags.report, buffer);
    console.log(color.dim(`Error report written to ${flags.report}`));
  };

  if (dryRun) {
    await writeReport(result.rows, 0);
    console.log('');
    console.log(color.bold('Dry run — nothing was written.'));
    return;
  }
  const importable = t.create + t.update;
  if (!importable) {
    await writeReport(result.rows, 0);
    throw new Error('No rows can be imported.');
  }
  if (!flags.yes) {
    if (!process.stdin.isTTY) throw new Error('Add --yes to import without a prompt.');
    const ok = await confirm(`\nImport ${importable} rows (${t.create} new, ${t.update} updated) into ${url}? [y/N] `);
    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  const importId = await createImportRecord(client, { type: 'employees', fileName, fileSize: bytes.length, workbook, source: 'cli' });
  const summary: ImportSummary = {
    file_size: bytes.length,
    file_kind: workbook.kind,
    encoding: workbook.encoding,
    sheets: analysis.sheets.map((s) => ({ name: s.name, rows: s.rows, hidden: s.hidden || undefined })),
    sheet_index: sheetIndex,
    sheet: sheet.name,
    header_row: table.headerRow,
    header_rows: table.headerRows,
    source: 'cli',
  };
  await saveValidation(client, importId, {
    rows: result.rows,
    totals: t,
    mapping: { sheet_index: sheetIndex, header_row: candidate.headerRow, header_rows: table.headerRows, columns: mapping.map(({ index, label, target }) => ({ index, label, target })) },
    options,
    summary,
  });
  await client.from('imports').update({ status: 'importing' }).eq('id', importId);

  const env: CommitEnv = { client, mode: 'service', importId, type: 'employees', options };
  const stats = emptyStats();
  let done = 0;
  for (;;) {
    const batch = await fetchPendingRows(client, importId, 100);
    if (!batch.length) break;
    const outcomes = await commitRows(env, batch, stats.masterCreated);
    await applyOutcomes(client, importId, batch, outcomes);
    addOutcomes(stats, outcomes);
    done += batch.length;
    process.stdout.write(`\r  imported ${done} / ${importable} rows`);
  }
  process.stdout.write('\n');
  const refs = await finalizeReferences(env, await fetchInFileReferenceRows(client, importId, 'manager'));
  const counts = await importRowCounts(client, importId);
  const finalStatus = counts.imported === 0 && counts.error > 0 ? 'failed' : 'completed';
  await client
    .from('imports')
    .update({
      status: finalStatus,
      imported_rows: counts.imported,
      error_rows: counts.error,
      completed_at: new Date().toISOString(),
      summary: {
        ...summary,
        actions: { create: t.create, update: t.update, skip: t.skip },
        result: { created: stats.created, updated: stats.updated, skipped: stats.skipped, failed: stats.failed, master_created: stats.masterCreated, linked: refs.linked, unresolved: refs.unresolved },
      },
    })
    .eq('id', importId);
  await deleteImportSource(client, importId);
  await client.rpc('log_audit_event', {
    p_action: 'employee.import',
    p_entity_type: 'import',
    p_entity_id: importId,
    p_summary: `${fileName} · ${stats.created} created · ${stats.updated} updated · ${stats.failed} failed (CLI)`,
    p_changes: { file: fileName, created: stats.created, updated: stats.updated, skipped: stats.skipped, failed: stats.failed, source: 'cli' },
  });

  // Final row results for the report (paged: PostgREST returns at most 1,000 rows per request).
  const finalRows: Array<{ row_number: number; status: string; raw: unknown; errors: unknown; warnings: unknown }> = [];
  if (typeof flags.report === 'string') {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client
        .from('import_rows')
        .select('row_number, status, raw, errors, warnings')
        .eq('import_id', importId)
        .order('row_number')
        .range(from, from + 999);
      if (error) throw error;
      finalRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  await writeReport(
    finalRows.map((r) => ({
      rowNumber: r.row_number,
      status: r.status as never,
      action: 'skip',
      raw: r.raw as never,
      mapped: {},
      errors: r.errors as never,
      warnings: r.warnings as never,
    })),
    counts.imported,
  );

  console.log('');
  console.log(color.bold(finalStatus === 'completed' ? color.green('Import complete') : color.red('Import failed')) + color.dim(`  (import ${importId})`));
  console.log(`  created ${stats.created} · updated ${stats.updated} · skipped ${counts.skipped} · not imported ${counts.error}`);
  const master = Object.entries(stats.masterCreated);
  if (master.length) console.log(`  master data created: ${master.map(([k, v]) => `${v} ${k}`).join(', ')}`);
  if (refs.linked || refs.unresolved) console.log(`  managers linked ${refs.linked}${refs.unresolved ? `, unresolved ${refs.unresolved}` : ''}`);
  console.log('');
}

main().catch((error) => {
  console.error(color.red(`import-employees: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});
