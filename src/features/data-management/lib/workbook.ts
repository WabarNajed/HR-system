/**
 * Workbook / CSV parsing into a JSON-safe grid (sheets → rows → cells), header-row detection and
 * table extraction (two-row headers, merged cells, blank and repeated-header rows).
 */
import { columnLetter, headerTokens, matchKey } from './normalize';
import type { ExtractedTable, JsonCell, ParsedSheet, ParsedWorkbook, TableColumn, TableRow } from './types';
import { cellText, isBlank, parseDateValue, parseNumberValue } from './values';

export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_COLUMNS = 150;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type WorkbookErrorCode = 'unsupportedFormat' | 'legacyXls' | 'emptyFile' | 'corruptFile' | 'tooManyRows' | 'tooLarge';

export class WorkbookError extends Error {
  constructor(public code: WorkbookErrorCode) {
    super(code);
    this.name = 'WorkbookError';
  }
}

export function fileKind(fileName: string): 'xlsx' | 'csv' | 'xls' | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv';
  if (ext === 'xls') return 'xls';
  return null;
}

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/* ─── Cell conversion ─────────────────────────────────────────────────────── */

function dateToJson(d: Date): JsonCell {
  if (Number.isNaN(d.getTime())) return null;
  const rounded = new Date(Math.round(d.getTime() / 60000) * 60000);
  const iso = rounded.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

// exceljs cell values are a union of primitives and objects.
function convertCell(value: unknown): JsonCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return dateToJson(value);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((p) => p.text ?? '').join('');
    if ('result' in v) return convertCell(v.result);
    if ('formula' in v || 'sharedFormula' in v) return null;
    if ('text' in v) return convertCell(v.text);
    if ('error' in v) return null;
  }
  return null;
}

function trimRow(row: JsonCell[]): JsonCell[] {
  let end = row.length;
  while (end > 0 && isBlank(row[end - 1])) end--;
  return end === row.length ? row : row.slice(0, end);
}

function trimRows(rows: JsonCell[][]): JsonCell[][] {
  let end = rows.length;
  while (end > 0 && rows[end - 1]!.length === 0) end--;
  return end === rows.length ? rows : rows.slice(0, end);
}

function decodeRange(range: string): { top: number; left: number; bottom: number; right: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(range.trim());
  if (!m) return null;
  const col = (letters: string) => letters.toUpperCase().split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
  const left = col(m[1]!);
  const top = Number(m[2]) - 1;
  const right = m[3] ? col(m[3]) : left;
  const bottom = m[4] ? Number(m[4]) - 1 : top;
  return { top: Math.min(top, bottom), left: Math.min(left, right), bottom: Math.max(top, bottom), right: Math.max(left, right) };
}

/* ─── XLSX ────────────────────────────────────────────────────────────────── */

async function parseXlsx(bytes: Uint8Array): Promise<ParsedWorkbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs accepts a Node Buffer / ArrayBuffer.
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new WorkbookError('corruptFile');
  }
  const sheets: ParsedSheet[] = [];
  for (const ws of wb.worksheets) {
    const rowCount = Math.min(ws.rowCount, MAX_IMPORT_ROWS + 200);
    if (ws.actualRowCount > MAX_IMPORT_ROWS + 200) throw new WorkbookError('tooManyRows');
    const colCount = Math.min(ws.columnCount, MAX_IMPORT_COLUMNS);
    const rows: JsonCell[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const cells: JsonCell[] = [];
      if (row.hasValues) {
        for (let c = 1; c <= colCount; c++) {
          const cell = row.getCell(c);
          const isSlave = cell.isMerged && cell.master && cell.master.address !== cell.address;
          cells.push(isSlave ? null : convertCell(cell.value));
        }
      }
      rows.push(trimRow(cells));
    }
    const merges = ((ws.model as { merges?: string[] }).merges ?? [])
      .map(decodeRange)
      .filter((m): m is NonNullable<typeof m> => m !== null);
    sheets.push({ name: ws.name, rows: trimRows(rows), merges, hidden: ws.state !== 'visible' && ws.state !== undefined ? true : undefined });
  }
  return { kind: 'xlsx', sheets };
}

/* ─── CSV ─────────────────────────────────────────────────────────────────── */

function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8' };
  } catch {
    // Arabic CSVs saved by older Excel versions are Windows-1256.
    try {
      return { text: new TextDecoder('windows-1256').decode(bytes), encoding: 'windows-1256' };
    } catch {
      return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
    }
  }
}

async function parseCsv(bytes: Uint8Array, name: string): Promise<ParsedWorkbook> {
  const Papa = (await import('papaparse')).default;
  const { text, encoding } = decodeText(bytes);
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false, dynamicTyping: false });
  const data = result.data;
  if (data.length > MAX_IMPORT_ROWS + 200) throw new WorkbookError('tooManyRows');
  const rows = trimRows(
    data.map((r) => trimRow(r.slice(0, MAX_IMPORT_COLUMNS).map((c) => (typeof c === 'string' && c.trim() !== '' ? c : null)))),
  );
  const base = name.replace(/\.[^.]+$/, '') || 'CSV';
  return { kind: 'csv', sheets: [{ name: base.slice(0, 31), rows, merges: [] }], encoding };
}

/** Parses an uploaded XLSX/CSV file. Throws `WorkbookError` for unsupported/corrupt/oversized files. */
export async function parseWorkbook(data: ArrayBuffer | Uint8Array, fileName: string): Promise<ParsedWorkbook> {
  const bytes = toUint8(data);
  if (bytes.byteLength === 0) throw new WorkbookError('emptyFile');
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new WorkbookError('tooLarge');
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const kind = fileKind(fileName);
  if (isOle || kind === 'xls') throw new WorkbookError('legacyXls');
  let parsed: ParsedWorkbook;
  if (isZip) parsed = await parseXlsx(bytes);
  else if (kind === 'csv') parsed = await parseCsv(bytes, fileName);
  else if (kind === 'xlsx') throw new WorkbookError('corruptFile');
  else throw new WorkbookError('unsupportedFormat');
  if (!parsed.sheets.some((s) => s.rows.some((r) => r.length > 0))) throw new WorkbookError('emptyFile');
  return parsed;
}

/* ─── Header detection & table extraction ─────────────────────────────────── */

/** Footer rows ("Total", "الإجمالي", "المجموع") — only when the row has at most 3 filled cells. */
const SUMMARY_ROW = /^(الاجمالي|اجمالي|المجموع|مجموع|الاجمالي العام|المجموع الكلي|total|totals|grand total|sum)(\s|$)/;

function isTextLike(value: JsonCell): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s || s.length > 80) return false;
  const num = parseNumberValue(s);
  if (num && num.ok) return false;
  const date = parseDateValue(s);
  if (date && date.ok) return false;
  return /[A-Za-z؀-ۿ]/.test(s);
}

export type HeaderScorer = (label: string) => number;

/**
 * Picks the header row among the first 30 rows: many short text cells, known column names
 * (via `scoreLabel`, 0..1), few numbers/dates, and data underneath.
 */
export function detectHeaderRow(sheet: ParsedSheet, scoreLabel?: HeaderScorer): number {
  const limit = Math.min(sheet.rows.length, 30);
  let best = -1;
  let bestScore = -Infinity;
  for (let r = 0; r < limit; r++) {
    const row = sheet.rows[r] ?? [];
    const nonEmpty = row.filter((c) => !isBlank(c));
    if (nonEmpty.length < 2) continue;
    let text = 0;
    let other = 0;
    let known = 0;
    for (const c of nonEmpty) {
      if (isTextLike(c)) {
        text++;
        if (scoreLabel && scoreLabel(String(c)) >= 0.75) known++;
      } else other++;
    }
    const below = sheet.rows[r + 1] ?? [];
    const belowFill = below.filter((c) => !isBlank(c)).length;
    let score = known * 3 + text - other * 1.5;
    if (belowFill >= Math.max(1, nonEmpty.length / 2)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (best >= 0) return best;
  const first = sheet.rows.findIndex((r) => r.some((c) => !isBlank(c)));
  return Math.max(0, first);
}

function headerCellText(sheet: ParsedSheet, r: number, c: number): string | null {
  const direct = cellText(sheet.rows[r]?.[c] ?? null);
  if (direct !== null) return direct;
  // Horizontally merged header cells: take the master's label.
  const merge = sheet.merges.find((m) => m.top <= r && m.bottom >= r && m.left <= c && m.right >= c && (m.left !== c || m.top !== r));
  if (merge && merge.top === r) return cellText(sheet.rows[merge.top]?.[merge.left] ?? null);
  return null;
}

/** True when the header row groups columns (horizontal merge) with sub-headers in the next row. */
export function hasTwoRowHeader(sheet: ParsedSheet, headerRow: number): boolean {
  const groups = sheet.merges.filter((m) => m.top === headerRow && m.bottom === headerRow && m.right > m.left);
  if (!groups.length) return false;
  const next = sheet.rows[headerRow + 1] ?? [];
  return groups.some((g) => {
    for (let c = g.left; c <= g.right; c++) if (!isTextLike(next[c] ?? null)) return false;
    return true;
  });
}

/**
 * Builds the table below `headerRow`: labels (empty headers become `Column F`, duplicates get a
 * suffix), data rows with vertically merged cells filled from their master, and blank or
 * repeated-header rows removed.
 */
export function extractTable(sheet: ParsedSheet, headerRow: number, headerRows?: 1 | 2): ExtractedTable {
  const twoRows = headerRows ? headerRows === 2 : hasTwoRowHeader(sheet, headerRow);
  const dataStart = headerRow + (twoRows ? 2 : 1);
  const width = Math.min(
    MAX_IMPORT_COLUMNS,
    sheet.rows.slice(headerRow).reduce((w, r) => Math.max(w, r.length), 0),
  );

  // Fill vertically merged data cells from their master.
  const fill = new Map<string, JsonCell>();
  for (const m of sheet.merges) {
    if (m.bottom < dataStart || m.bottom === m.top) continue;
    const master = sheet.rows[m.top]?.[m.left] ?? null;
    for (let r = Math.max(m.top, dataStart); r <= m.bottom; r++) {
      if (r === m.top) continue;
      fill.set(`${r}:${m.left}`, master);
    }
  }
  const cellAt = (r: number, c: number): JsonCell => {
    const v = sheet.rows[r]?.[c] ?? null;
    if (v !== null) return v;
    return fill.get(`${r}:${c}`) ?? null;
  };

  const rawColumns: Array<{ index: number; label: string | null }> = [];
  for (let c = 0; c < width; c++) {
    const top = headerCellText(sheet, headerRow, c);
    let label = top;
    if (twoRows) {
      const sub = cellText(sheet.rows[headerRow + 1]?.[c] ?? null);
      if (sub) label = top && top !== sub ? `${top} ${sub}` : sub;
    }
    rawColumns.push({ index: c, label });
  }

  const dataRows: TableRow[] = [];
  let skippedBlank = 0;
  let skippedRepeatedHeader = 0;
  let skippedSummary = 0;
  const headerKeys = rawColumns.map((c) => (c.label ? headerTokens(c.label).join(' ') : ''));
  for (let r = dataStart; r < sheet.rows.length; r++) {
    const cells: JsonCell[] = [];
    let filled = 0;
    let repeats = 0;
    for (let c = 0; c < width; c++) {
      const v = cellAt(r, c);
      cells.push(v);
      if (!isBlank(v)) {
        filled++;
        if (typeof v === 'string' && headerKeys[c] && headerTokens(v).join(' ') === headerKeys[c]) repeats++;
      }
    }
    if (filled === 0) {
      skippedBlank++;
      continue;
    }
    if (filled >= 2 && repeats / filled >= 0.8) {
      skippedRepeatedHeader++;
      continue;
    }
    if (filled <= 3 && cells.some((v) => typeof v === 'string' && SUMMARY_ROW.test(matchKey(v)))) {
      skippedSummary++;
      continue;
    }
    dataRows.push({ rowNumber: r + 1, cells });
  }

  // Drop columns that are empty in the header and in every data row.
  const used = rawColumns.filter((col) => col.label !== null || dataRows.some((row) => !isBlank(row.cells[col.index])));
  const seen = new Map<string, number>();
  const columns: TableColumn[] = used.map((col) => {
    const base = col.label ?? `Column ${columnLetter(col.index)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { index: col.index, label: count > 1 ? `${base} (${count})` : base, generated: col.label === null };
  });

  return { headerRow: headerRow + 1, headerRows: twoRows ? 2 : 1, columns, rows: dataRows, skippedBlank, skippedRepeatedHeader, skippedSummary };
}

/** First `limit` rows of a sheet for the header picker (cells as display strings). */
export function previewGrid(sheet: ParsedSheet, limit = 12, maxCols = 12): string[][] {
  return sheet.rows.slice(0, limit).map((row) =>
    Array.from({ length: Math.min(maxCols, Math.max(row.length, 1)) }, (_, c) => {
      const v = row[c] ?? null;
      return v === null ? '' : String(cellText(v) ?? '');
    }),
  );
}

/** Non-blank data row count of a sheet (rough, for the sheet picker). */
export function countDataRows(sheet: ParsedSheet): number {
  return sheet.rows.filter((r) => r.some((c) => !isBlank(c))).length;
}
