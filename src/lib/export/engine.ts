import 'server-only';

import { DEFAULT_TIME_ZONE, type Locale } from '@/lib/i18n/config';
import { formatDate, formatDateTime } from '@/lib/i18n/date-format';
import { escapeHtml } from '@/lib/email/render';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { pdfBaseCss } from '@/lib/pdf/fonts';
import { renderPdf } from '@/lib/pdf/render';
import type { ExportColumn, ExportColumnType } from './types';

/**
 * Rows → files. XLSX (exceljs: bold branded header, frozen header, autofilter, RTL sheet for
 * Arabic, real dates/numbers), CSV (UTF-8 with BOM so Excel renders Arabic, RFC 4180 quoting,
 * formula-injection safe) and PDF (HTML table report via headless Chromium).
 */

export type BuildInput<Row> = {
  columns: ExportColumn<Row>[];
  rows: Row[];
};

type Cell = string | number | boolean | Date | null;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function rawValue<Row>(col: ExportColumn<Row>, row: Row): unknown {
  if (col.value) return col.value(row);
  return (row as Record<string, unknown>)[col.key];
}

/** Wall-clock time in the org time zone as a UTC-based Date (Excel has no time zones). */
function wallClockDate(value: Date, timeZone = DEFAULT_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')));
}

function toDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d));
  }
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : wallClockDate(d);
}

function toNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Typed cell value for XLSX. */
function typedCell<Row>(col: ExportColumn<Row>, row: Row, yesNo: [string, string]): Cell {
  const type = col.type ?? 'text';
  const value = rawValue(col, row);
  switch (type) {
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent':
      return toNumberValue(value);
    case 'date':
    case 'datetime':
      return toDateValue(value);
    case 'boolean':
      return value === null || value === undefined ? null : value ? yesNo[0] : yesNo[1];
    default:
      if (value === null || value === undefined) return null;
      if (Array.isArray(value)) return value.join(', ');
      return String(value);
  }
}

/** Display string (CSV/PDF). Dates `yyyy-MM-dd` in CSV (machine-friendly), contract format in PDF. */
function displayCell<Row>(
  col: ExportColumn<Row>,
  row: Row,
  opts: { locale: Locale; target: 'csv' | 'pdf'; yesNo: [string, string]; currency: string },
): string {
  const type = col.type ?? 'text';
  const value = rawValue(col, row);
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'number':
    case 'integer': {
      const n = toNumberValue(value);
      if (n === null) return '';
      return opts.target === 'csv' ? String(n) : formatNumber(n, opts.locale, type === 'integer' ? { maximumFractionDigits: 0 } : {});
    }
    case 'currency': {
      const n = toNumberValue(value);
      if (n === null) return '';
      return opts.target === 'csv' ? n.toFixed(2) : formatCurrency(n, opts.locale, opts.currency);
    }
    case 'percent': {
      const n = toNumberValue(value);
      if (n === null) return '';
      return opts.target === 'csv' ? String(n) : formatPercent(n, opts.locale);
    }
    case 'date': {
      if (opts.target === 'pdf') return formatDate(value as string, opts.locale);
      const d = toDateValue(value);
      return d ? d.toISOString().slice(0, 10) : '';
    }
    case 'datetime': {
      if (opts.target === 'pdf') return formatDateTime(value as string, opts.locale);
      const d = toDateValue(value);
      return d ? d.toISOString().slice(0, 16).replace('T', ' ') : '';
    }
    case 'boolean':
      return value ? opts.yesNo[0] : opts.yesNo[1];
    default:
      return Array.isArray(value) ? value.join(', ') : String(value);
  }
}

function defaultWidth(type: ExportColumnType | undefined): number {
  switch (type) {
    case 'date':
      return 14;
    case 'datetime':
      return 18;
    case 'number':
    case 'integer':
    case 'percent':
      return 12;
    case 'currency':
      return 16;
    case 'boolean':
      return 10;
    default:
      return 24;
  }
}

/** Excel sheet names: ≤31 chars, none of `[]:*?/\`. */
export function safeSheetName(name: string): string {
  const clean = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return clean || 'Sheet1';
}

/* ─── XLSX ─────────────────────────────────────────────────────────────────── */

export type BuildXlsxInput<Row> = BuildInput<Row> & {
  sheetName: string;
  /** Right-to-left sheet view (Arabic). */
  rtl?: boolean;
  /** Header fill (hex, default brand teal). */
  headerColor?: string | null;
  /** Translated Yes/No for boolean columns. */
  yesNo?: [string, string];
  creator?: string;
};

export async function buildXlsx<Row>(input: BuildXlsxInput<Row>): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.creator ?? 'HR Portal';
  wb.created = new Date();
  const ws = wb.addWorksheet(safeSheetName(input.sheetName), {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0, rightToLeft: Boolean(input.rtl) }],
    properties: { defaultRowHeight: 18 },
  });
  const yesNo = input.yesNo ?? ['Yes', 'No'];
  const fill = (input.headerColor ?? '#0F5E6B').replace('#', '').toUpperCase().padStart(6, '0');

  ws.columns = input.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? defaultWidth(c.type) }));

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
    cell.alignment = { vertical: 'middle', horizontal: input.rtl ? 'right' : 'left', readingOrder: input.rtl ? 'rtl' : 'ltr' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCFD8DB' } } };
  });

  for (const row of input.rows) {
    const values: Record<string, Cell> = {};
    for (const col of input.columns) values[col.key] = typedCell(col, row, yesNo);
    ws.addRow(values);
  }

  input.columns.forEach((col, i) => {
    const column = ws.getColumn(i + 1);
    switch (col.type) {
      case 'date':
        column.numFmt = 'yyyy-mm-dd';
        break;
      case 'datetime':
        column.numFmt = 'yyyy-mm-dd hh:mm';
        break;
      case 'currency':
        column.numFmt = '#,##0.00';
        break;
      case 'integer':
        column.numFmt = '#,##0';
        break;
      case 'percent':
        column.numFmt = '0.0%';
        break;
      default:
        break;
    }
    if (col.type === undefined || col.type === 'text') {
      column.alignment = { vertical: 'top', wrapText: false, readingOrder: input.rtl ? 'rtl' : 'ltr' };
    }
  });

  if (input.columns.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: input.columns.length } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

/* ─── CSV ──────────────────────────────────────────────────────────────────── */

/** Quotes per RFC 4180 and neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@`, tab, CR). */
export function csvEscape(value: string, isNumeric = false): string {
  let v = value;
  if (!isNumeric && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export type BuildCsvInput<Row> = BuildInput<Row> & {
  locale: Locale;
  yesNo?: [string, string];
  currency?: string;
};

/** UTF-8 CSV with BOM (Excel-friendly Arabic), CRLF line endings. */
export function buildCsv<Row>(input: BuildCsvInput<Row>): Buffer {
  const yesNo = input.yesNo ?? ['Yes', 'No'];
  const numericTypes: (ExportColumnType | undefined)[] = ['number', 'integer', 'currency', 'percent'];
  const lines = [input.columns.map((c) => csvEscape(c.header)).join(',')];
  for (const row of input.rows) {
    lines.push(
      input.columns
        .map((c) =>
          csvEscape(
            displayCell(c, row, { locale: input.locale, target: 'csv', yesNo, currency: input.currency ?? 'SAR' }),
            numericTypes.includes(c.type),
          ),
        )
        .join(','),
    );
  }
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
}

/* ─── PDF ──────────────────────────────────────────────────────────────────── */

export type BuildPdfInput<Row> = BuildInput<Row> & {
  locale: Locale;
  title: string;
  orgName?: string | null;
  /** Translated "Generated on 27 Sep 2026 · 14:05" line. */
  generatedLabel: string;
  /** Translated filter lines ("Status: Active"). */
  filters?: string[];
  /** Translated "{count} records" line. */
  countLabel?: string;
  /** Translated text shown when there are no rows. */
  emptyLabel?: string;
  landscape?: boolean;
  primaryColor?: string | null;
  logoUrl?: string | null;
  yesNo?: [string, string];
  currency?: string;
};

export function buildPdfHtml<Row>(input: BuildPdfInput<Row>): string {
  const rtl = input.locale === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const primary = /^#[0-9a-f]{6}$/i.test(input.primaryColor ?? '') ? input.primaryColor! : '#0F5E6B';
  const yesNo = input.yesNo ?? ['Yes', 'No'];
  const numericTypes: (ExportColumnType | undefined)[] = ['number', 'integer', 'currency', 'percent'];
  const ltrTypes: (ExportColumnType | undefined)[] = [...numericTypes, 'date', 'datetime'];

  const head = input.columns
    .map((c) => `<th class="${numericTypes.includes(c.type) ? 'n' : ''}">${escapeHtml(c.header)}</th>`)
    .join('');
  const body = input.rows.length
    ? input.rows
        .map(
          (row) =>
            `<tr>${input.columns
              .map((c) => {
                const text = displayCell(c, row, { locale: input.locale, target: 'pdf', yesNo, currency: input.currency ?? 'SAR' });
                const cls = [numericTypes.includes(c.type) ? 'n' : '', ltrTypes.includes(c.type) ? 'num' : ''].filter(Boolean).join(' ');
                return `<td${cls ? ` class="${cls}"` : ''}>${escapeHtml(text)}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('')
    : `<tr><td class="empty" colspan="${input.columns.length || 1}">${escapeHtml(input.emptyLabel ?? '')}</td></tr>`;

  const filters = input.filters?.length
    ? `<div class="filters">${input.filters.map((f) => `<span>${escapeHtml(f)}</span>`).join('')}</div>`
    : '';
  const logo = input.logoUrl ? `<img class="logo" src="${escapeHtml(input.logoUrl)}" alt="" />` : '';

  return `<!doctype html><html lang="${input.locale}" dir="${dir}"><head><meta charset="utf-8" />
<title>${escapeHtml(input.title)}</title>
<style>
${pdfBaseCss()}
body{font-size:9pt;}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid ${primary};padding-bottom:10px;margin-bottom:10px;}
.top h1{margin:0;font-size:15pt;font-weight:700;color:#0f1b1f;}
.top .org{font-size:9.5pt;color:#5b6b70;margin-top:2px;}
.top .meta{font-size:8.5pt;color:#5b6b70;text-align:end;white-space:nowrap;}
.logo{height:32px;max-width:160px;object-fit:contain;}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;}
.filters span{background:#eef2f3;border-radius:4px;padding:2px 8px;font-size:8.5pt;color:#24343a;}
table{font-size:8.5pt;}
th{background:${primary};color:#fff;font-weight:600;text-align:start;padding:6px 7px;border:1px solid ${primary};}
td{padding:5px 7px;border:1px solid #e3e8ea;vertical-align:top;}
tbody tr:nth-child(even) td{background:#f8fafa;}
th.n,td.n{text-align:end;}
td.num{direction:ltr;unicode-bidi:isolate;}
td.empty{text-align:center;color:#5b6b70;padding:24px;}
</style></head>
<body dir="${dir}">
<div class="top">
  <div style="display:flex;align-items:center;gap:12px;">${logo}<div><h1>${escapeHtml(input.title)}</h1>${
    input.orgName ? `<div class="org">${escapeHtml(input.orgName)}</div>` : ''
  }</div></div>
  <div class="meta"><div>${escapeHtml(input.generatedLabel)}</div>${input.countLabel ? `<div>${escapeHtml(input.countLabel)}</div>` : ''}</div>
</div>
${filters}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}

const PAGE_FOOTER = `<div style="width:100%;font-size:8px;color:#7d8c91;padding:0 14mm;text-align:center;font-family:sans-serif;direction:ltr;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`;

/** Landscape A4 table report with repeated header row and page numbers. */
export async function buildPdf<Row>(input: BuildPdfInput<Row>): Promise<Buffer> {
  return renderPdf({
    html: buildPdfHtml(input),
    landscape: input.landscape ?? true,
    margins: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
    footerTemplate: PAGE_FOOTER,
    timeoutMs: 60_000,
  });
}
