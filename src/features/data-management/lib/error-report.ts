/**
 * Error report workbook: every row with errors or warnings (and rows that failed while writing),
 * with the messages in the reader's language and the original values in the file's column order.
 */
import { msg, issueText, type MessageLocale } from './messages';
import type { ImportType, Issue, JsonCell } from './types';

export type ReportRow = {
  row_number: number;
  status: string;
  raw: Record<string, JsonCell>;
  errors: Issue[];
  warnings: Issue[];
};

export type ErrorReportInput = {
  locale: MessageLocale;
  type: ImportType;
  fileName: string;
  createdAt: string | null;
  columns: string[];
  rows: ReportRow[];
  totals: { total: number; valid: number; warning: number; error: number; imported: number };
  headerColor?: string;
};

const STATUS_FILL: Record<string, string> = {
  error: 'FFFBE3E1',
  warning: 'FFFDF0DC',
  skipped: 'FFEEF1F2',
  imported: 'FFE3F4EC',
  valid: 'FFE3F4EC',
};

export async function buildErrorReport(input: ErrorReportInput): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const { locale } = input;
  const rtl = locale === 'ar';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR Portal';
  wb.created = new Date();
  const fill = (input.headerColor ?? '#0F5E6B').replace('#', '').toUpperCase();

  const ws = wb.addWorksheet(msg(locale, 'dataManagement.report.sheet').slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: rtl }],
  });
  const fixed = [
    { header: msg(locale, 'dataManagement.report.row'), key: '__row', width: 9 },
    { header: msg(locale, 'dataManagement.report.status'), key: '__status', width: 14 },
    { header: msg(locale, 'dataManagement.report.messages'), key: '__messages', width: 70 },
  ];
  ws.columns = [...fixed, ...input.columns.map((label, i) => ({ header: label, key: `c${i}`, width: Math.min(40, Math.max(12, label.length + 4)) }))];
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
    cell.alignment = { vertical: 'middle', horizontal: rtl ? 'right' : 'left', readingOrder: rtl ? 'rtl' : 'ltr', wrapText: true };
  });

  for (const row of input.rows) {
    const messages = [...row.errors, ...row.warnings]
      .filter((i) => i.level !== 'info' || i.code === 'writeFailed')
      .map((i) => `• ${issueText(i, input.type, locale)}`);
    const values: Record<string, unknown> = {
      __row: row.row_number,
      __status: msg(locale, `statuses.importRow.${row.status}`),
      __messages: messages.join('\n'),
    };
    input.columns.forEach((label, i) => {
      const v = row.raw[label];
      values[`c${i}`] = v === undefined ? null : v;
    });
    const added = ws.addRow(values);
    added.alignment = { vertical: 'top', readingOrder: rtl ? 'rtl' : 'ltr' };
    added.getCell('__messages').alignment = { vertical: 'top', wrapText: true, readingOrder: rtl ? 'rtl' : 'ltr' };
    const statusCell = added.getCell('__status');
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[row.status] ?? 'FFFFFFFF' } };
    statusCell.font = { bold: true };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fixed.length + input.columns.length } };

  const summary = wb.addWorksheet(msg(locale, 'dataManagement.report.summarySheet').slice(0, 31), { views: [{ rightToLeft: rtl }] });
  summary.columns = [
    { key: 'k', width: 32 },
    { key: 'v', width: 48 },
  ];
  const lines: Array<[string, string | number]> = [
    [msg(locale, 'dataManagement.report.file'), input.fileName],
    [msg(locale, 'dataManagement.report.type'), msg(locale, `dataManagement.types.${input.type}.title`)],
    [msg(locale, 'dataManagement.report.createdAt'), input.createdAt ? input.createdAt.slice(0, 16).replace('T', ' ') : ''],
    [msg(locale, 'dataManagement.report.total'), input.totals.total],
    [msg(locale, 'dataManagement.report.valid'), input.totals.valid],
    [msg(locale, 'dataManagement.report.warnings'), input.totals.warning],
    [msg(locale, 'dataManagement.report.errors'), input.totals.error],
    [msg(locale, 'dataManagement.report.imported'), input.totals.imported],
    [msg(locale, 'dataManagement.report.listed'), input.rows.length],
  ];
  summary.addRow({ k: msg(locale, 'dataManagement.report.title'), v: '' }).font = { bold: true, size: 14 };
  summary.addRow({});
  for (const [k, v] of lines) {
    const r = summary.addRow({ k, v });
    r.getCell('k').font = { bold: true };
    r.alignment = { horizontal: rtl ? 'right' : 'left', readingOrder: rtl ? 'rtl' : 'ltr' };
  }
  summary.addRow({});
  summary.addRow({ k: msg(locale, 'dataManagement.report.howToFix') }).font = { italic: true, color: { argb: 'FF5B6B70' } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
