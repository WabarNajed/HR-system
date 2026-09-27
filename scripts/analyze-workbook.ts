/**
 * Workbook analysis report (no data is written).
 *
 *   pnpm analyze:workbook "<file.xlsx|csv>" [--type employees] [--sheet <name|number>] [--json out.json] [--db] [--rows 20]
 *
 *   --type    import type (default employees): employees, departments, job_titles, locations, cost_centers,
 *             leave_balances, dependents, insurance, documents, public_holidays
 *   --sheet   sheet name or 1-based number (default: the sheet that looks most like the type)
 *   --json    also write the full report as JSON
 *   --db      compare with the database too (existing employees, departments…) using SUPABASE_SERVICE_ROLE_KEY
 *   --rows    how many row-level problems to list (default 20)
 *
 * Prints: sheets, detected header row, column → field mapping with confidence, record count,
 * missing values per column, duplicates (employee number, Iqama, passport, email), invalid dates and
 * emails, Hijri dates, and the validation totals the import wizard would show.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyzeWorkbook } from '../src/features/data-management/lib/analyze';
import { cliEnv, color, pad, parseArgs, serviceClient } from '../src/features/data-management/lib/cli';
import { loadValidationContext } from '../src/features/data-management/lib/context';
import { fieldName, msg } from '../src/features/data-management/lib/messages';
import { EXTRA, IGNORE, isImportType, type ImportType } from '../src/features/data-management/lib/types';
import { parseWorkbook, WorkbookError } from '../src/features/data-management/lib/workbook';

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const file = positional[0];
  if (!file || flags.help) {
    console.log('Usage: pnpm analyze:workbook "<file.xlsx|csv>" [--type employees] [--sheet <name|number>] [--json out.json] [--db] [--rows 20]');
    process.exit(file ? 0 : 1);
  }
  const type = (typeof flags.type === 'string' ? flags.type : 'employees') as ImportType;
  if (!isImportType(type)) throw new Error(`Unknown --type "${String(flags.type)}".`);
  const maxRows = typeof flags.rows === 'string' ? Math.max(1, Number(flags.rows)) : 20;

  const bytes = readFileSync(file);
  let workbook;
  try {
    workbook = await parseWorkbook(bytes, basename(file));
  } catch (error) {
    if (error instanceof WorkbookError) throw new Error(msg('en', `dataManagement.errors.${error.code}`));
    throw error;
  }

  let sheet: number | string | undefined;
  if (typeof flags.sheet === 'string') sheet = /^\d+$/.test(flags.sheet) ? Number(flags.sheet) - 1 : flags.sheet;

  let context;
  if (flags.db) {
    const { client, url } = serviceClient(cliEnv());
    console.log(color.dim(`Comparing with the database at ${url}`));
    context = await loadValidationContext(client, type);
  }
  const report = analyzeWorkbook(workbook, type, { sheet, context });
  const a = report.analysis;

  console.log('');
  console.log(color.bold(`Workbook: ${basename(file)}`) + color.dim(`  (${report.kind}${report.encoding ? `, ${report.encoding}` : ''}, ${(bytes.length / 1024).toFixed(1)} KB)`));
  console.log(color.bold(`Import type: ${type}`));
  console.log('');
  console.log(color.bold('Sheets'));
  for (const s of report.sheets) {
    const marker = s.index === report.selected ? color.green('●') : ' ';
    console.log(`  ${marker} ${pad(s.index + 1, 3)} ${pad(s.name, 32)} ${pad(`${s.rows} non-empty rows`, 20)} header row ${pad(s.headerRow + 1, 4)} match score ${s.score}${s.hidden ? color.dim('  (hidden)') : ''}`);
  }
  console.log('');
  console.log(
    color.bold(`Sheet "${a.sheet}"`) +
      `: header row ${a.headerRow}${a.headerRows === 2 ? ' (two-row header)' : ''}, ${color.bold(String(a.records))} records` +
      color.dim(` (skipped: ${a.skippedBlank} blank, ${a.skippedRepeatedHeader} repeated header, ${a.skippedSummary} total/footer rows)`),
  );
  console.log('');
  console.log(color.bold('Column mapping'));
  console.log(color.dim(`  ${pad('Col', 4)} ${pad('Header in file', 34)} ${pad('→ Field', 34)} ${pad('Conf.', 6)} ${pad('Filled', 7)} ${pad('Missing', 8)} Samples`));
  for (const c of a.columns) {
    const target =
      c.target === EXTRA ? color.dim('(kept in extra_data)') : c.target === IGNORE ? color.dim('(ignored)') : `${c.target} · ${fieldName(type, c.target, 'en')}`;
    const conf = c.confidence ? c.confidence.toFixed(2) : '—';
    const extras = [c.invalidDates ? color.yellow(`${c.invalidDates} invalid dates`) : '', c.hijriDates ? `${c.hijriDates} Hijri` : '', c.invalidEmails ? color.yellow(`${c.invalidEmails} invalid emails`) : '']
      .filter(Boolean)
      .join(', ');
    console.log(`  ${pad(c.letter, 4)} ${pad(c.label, 34)} ${pad(target, 34)} ${pad(conf, 6)} ${pad(c.filled, 7)} ${pad(c.missing, 8)} ${c.samples.join(' | ')}${extras ? `  [${extras}]` : ''}`);
  }
  if (a.missingRequired.length) {
    console.log(color.red(`  Missing required fields: ${a.missingRequired.map((g) => g.map((k) => fieldName(type, k, 'en')).join(' or ')).join('; ')}`));
  }

  console.log('');
  console.log(color.bold('Data quality'));
  const t = a.totals;
  console.log(`  Records ${t.total} · ${color.green(`valid ${t.valid}`)} · ${color.yellow(`warnings ${t.warning}`)} · ${color.red(`errors ${t.error}`)}${t.total - t.valid - t.warning - t.error ? ` · skipped ${t.total - t.valid - t.warning - t.error}` : ''}`);
  console.log(`  An import would create ${t.create}, update ${t.update} and skip ${t.skip} records${context ? '' : color.dim(' (file only — run with --db to compare with existing data)')}.`);
  const missing = a.columns.filter((c) => c.target !== IGNORE && c.missing > 0);
  if (missing.length) {
    console.log('  Missing values per column:');
    for (const c of missing) console.log(`    ${pad(c.label, 34)} ${c.missing} of ${a.records}`);
  }
  if (a.duplicates.length) {
    console.log(`  Duplicates (${a.duplicates.length}):`);
    for (const d of a.duplicates.slice(0, maxRows)) console.log(`    ${pad(fieldName(type, d.field, 'en'), 26)} ${pad(d.value, 26)} rows ${d.rows.join(', ')}`);
  } else console.log('  Duplicates: none');
  if (a.invalidDates.length) {
    console.log(`  Invalid dates (${a.invalidDates.length}):`);
    for (const d of a.invalidDates.slice(0, maxRows)) console.log(`    row ${pad(d.row, 6)} ${pad(d.column, 30)} "${d.value}"`);
  } else console.log('  Invalid dates: none');
  if (a.invalidEmails.length) {
    console.log(`  Invalid emails (${a.invalidEmails.length}):`);
    for (const d of a.invalidEmails.slice(0, maxRows)) console.log(`    row ${pad(d.row, 6)} "${d.value}"`);
  } else console.log('  Invalid emails: none');
  const issues = Object.entries(a.issues).sort((x, y) => y[1] - x[1]);
  if (issues.length) {
    console.log('  Issues by type:');
    for (const [code, n] of issues) console.log(`    ${pad(code, 28)} ${n}`);
  }

  if (typeof flags.json === 'string') {
    writeFileSync(flags.json, JSON.stringify({ file: basename(file), type, ...report }, null, 2));
    console.log('');
    console.log(color.dim(`JSON report written to ${flags.json}`));
  }
  console.log('');
}

main().catch((error) => {
  console.error(color.red(`analyze-workbook: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});
