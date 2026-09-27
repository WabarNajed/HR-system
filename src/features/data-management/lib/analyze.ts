/**
 * Workbook analysis: sheet detection, header row, column mapping with confidence, and data
 * quality (record counts, missing values per column, duplicates, invalid dates and e-mails,
 * Hijri dates). Used by `pnpm analyze:workbook` and the import wizard's upload step.
 */
import { emptyValidationContext, type ValidationContext } from './context';
import { headerLabelScore, suggestMapping } from './mapping';
import { columnLetter } from './normalize';
import { getField, getSchema } from './schemas';
import { defaultImportOptions, EXTRA, IGNORE, type ExtractedTable, type ImportOptions, type ImportType, type MappingSuggestion, type ParsedSheet, type ParsedWorkbook, type ValidationTotals } from './types';
import { validateImport } from './validate';
import { cellText, isBlank, parseDateValue, parseEmailValue } from './values';
import { countDataRows, detectHeaderRow, extractTable } from './workbook';

export type SheetCandidate = {
  index: number;
  name: string;
  hidden: boolean;
  rows: number;
  headerRow: number;
  /** Sum of mapping confidences (how much the sheet looks like the entity). */
  score: number;
};

export type ColumnReport = MappingSuggestion & {
  letter: string;
  filled: number;
  missing: number;
  distinct: number;
  samples: string[];
  invalidDates: number;
  hijriDates: number;
  invalidEmails: number;
};

export type DuplicateReport = { field: string; value: string; rows: number[] };

export type SheetAnalysis = {
  sheet: string;
  headerRow: number;
  headerRows: number;
  records: number;
  skippedBlank: number;
  skippedRepeatedHeader: number;
  skippedSummary: number;
  columns: ColumnReport[];
  unmapped: string[];
  missingRequired: string[][];
  duplicates: DuplicateReport[];
  invalidDates: Array<{ row: number; column: string; value: string }>;
  invalidEmails: Array<{ row: number; column: string; value: string }>;
  totals: ValidationTotals;
  /** Issue code → count (errors and warnings). */
  issues: Record<string, number>;
};

export type WorkbookAnalysis = {
  kind: ParsedWorkbook['kind'];
  encoding?: string;
  sheets: SheetCandidate[];
  selected: number;
  analysis: SheetAnalysis;
};

export function rankSheets(workbook: ParsedWorkbook, type: ImportType): SheetCandidate[] {
  const scorer = headerLabelScore(type);
  return workbook.sheets.map((sheet, index) => {
    const headerRow = detectHeaderRow(sheet, scorer);
    const table = extractTable(sheet, headerRow);
    const mapping = suggestMapping(type, table, 50);
    const score = mapping.reduce((s, m) => s + m.confidence, 0) + Math.min(table.rows.length, 50) / 100;
    return { index, name: sheet.name, hidden: Boolean(sheet.hidden), rows: countDataRows(sheet), headerRow, score: Number(score.toFixed(2)) };
  });
}

export function pickSheet(candidates: readonly SheetCandidate[]): number {
  const visible = candidates.filter((c) => !c.hidden && c.rows > 0);
  const pool = visible.length ? visible : candidates;
  return pool.reduce((best, c) => (c.score > best.score ? c : best), pool[0]!).index;
}

export function analyzeSheet(
  type: ImportType,
  sheet: ParsedSheet,
  table: ExtractedTable,
  mapping: MappingSuggestion[],
  options: { context?: ValidationContext; importOptions?: ImportOptions } = {},
): SheetAnalysis {
  const columns: ColumnReport[] = mapping.map((m) => {
    const values = table.rows.map((r) => r.cells[m.index] ?? null);
    const filled = values.filter((v) => !isBlank(v));
    const field = m.target !== IGNORE && m.target !== EXTRA ? getField(type, m.target) : undefined;
    let invalidDates = 0;
    let hijriDates = 0;
    let invalidEmails = 0;
    for (const v of filled) {
      if (field && (field.type === 'date' || field.type === 'hijri')) {
        const d = parseDateValue(v);
        if (!d || !d.ok) invalidDates++;
        else if (d.calendar === 'hijri') hijriDates++;
      }
      if (field?.type === 'email') {
        const e = parseEmailValue(v);
        if (e && !e.ok) invalidEmails++;
      }
    }
    const distinct = new Set(filled.map((v) => String(cellText(v)))).size;
    return {
      ...m,
      letter: columnLetter(m.index),
      filled: filled.length,
      missing: values.length - filled.length,
      distinct,
      samples: Array.from(new Set(filled.slice(0, 20).map((v) => String(cellText(v))))).slice(0, 4),
      invalidDates,
      hijriDates,
      invalidEmails,
    };
  });

  const context = options.context ?? emptyValidationContext(type);
  const result = validateImport({ type, table, mapping, options: options.importOptions ?? defaultImportOptions(), context });

  const duplicates: DuplicateReport[] = [];
  const invalidDates: SheetAnalysis['invalidDates'] = [];
  const invalidEmails: SheetAnalysis['invalidEmails'] = [];
  const issues: Record<string, number> = {};
  const dupSeen = new Set<string>();
  for (const row of result.rows) {
    for (const issue of [...row.errors, ...row.warnings]) {
      if (issue.level !== 'info') issues[issue.code] = (issues[issue.code] ?? 0) + 1;
      if (issue.code === 'duplicateInFileFirst' && issue.field) {
        const key = `${issue.field}:${issue.value}`;
        if (!dupSeen.has(key)) {
          dupSeen.add(key);
          const others = String(issue.params?.rows ?? '')
            .split(',')
            .map((s) => Number(s.trim()))
            .filter(Boolean);
          duplicates.push({ field: issue.field, value: issue.value ?? '', rows: [row.rowNumber, ...others] });
        }
      }
      if ((issue.code === 'invalidDate' || issue.code === 'invalidHijri' || issue.code === 'hijriOutOfRange') && issue.column) {
        invalidDates.push({ row: row.rowNumber, column: issue.column, value: issue.value ?? '' });
      }
      if (issue.code === 'invalidEmail' && issue.column) invalidEmails.push({ row: row.rowNumber, column: issue.column, value: issue.value ?? '' });
    }
  }
  const mapped = new Set(mapping.map((m) => m.target));
  const requiredAnyOf = getRequired(type);
  return {
    sheet: sheet.name,
    headerRow: table.headerRow,
    headerRows: table.headerRows,
    records: table.rows.length,
    skippedBlank: table.skippedBlank,
    skippedRepeatedHeader: table.skippedRepeatedHeader,
    skippedSummary: table.skippedSummary,
    columns,
    unmapped: mapping.filter((m) => m.target === EXTRA || m.target === IGNORE).map((m) => m.label),
    missingRequired: requiredAnyOf.filter((g) => !g.some((k) => mapped.has(k))),
    duplicates,
    invalidDates,
    invalidEmails,
    totals: result.totals,
    issues,
  };
}

function getRequired(type: ImportType): string[][] {
  return getSchema(type).requiredAnyOf.map((g) => [...g]);
}

/** Full analysis of a workbook for one import type (optionally a specific sheet). */
export function analyzeWorkbook(
  workbook: ParsedWorkbook,
  type: ImportType,
  options: { sheet?: number | string; context?: ValidationContext; importOptions?: ImportOptions } = {},
): WorkbookAnalysis {
  const sheets = rankSheets(workbook, type);
  let selected = pickSheet(sheets);
  if (options.sheet !== undefined) {
    const wanted = typeof options.sheet === 'number' ? options.sheet : sheets.findIndex((s) => s.name === options.sheet);
    if (wanted >= 0 && wanted < sheets.length) selected = wanted;
  }
  const sheet = workbook.sheets[selected]!;
  const table = extractTable(sheet, sheets[selected]!.headerRow);
  const mapping = suggestMapping(type, table);
  return {
    kind: workbook.kind,
    encoding: workbook.encoding,
    sheets,
    selected,
    analysis: analyzeSheet(type, sheet, table, mapping, options),
  };
}
