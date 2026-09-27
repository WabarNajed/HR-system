/**
 * Downloadable import templates: a data sheet (localized headers, required columns highlighted, a
 * clearly marked example row that the importer skips, drop-down lists for enumerations), a
 * bilingual Instructions sheet and a hidden Lists sheet. Headers are recognized in either language
 * on re-import.
 */
import { msg, type MessageLocale } from './messages';
import { ENUMS, fieldLabel, getSchema, type FieldDef } from './schemas';
import type { ImportType, JsonCell } from './types';

function isRequired(type: ImportType, key: string): boolean {
  const schema = getSchema(type);
  return schema.requiredAnyOf.some((g) => g.length === 1 && g[0] === key);
}

function requiredGroupNote(type: ImportType, locale: MessageLocale): string[] {
  const schema = getSchema(type);
  return schema.requiredAnyOf
    .filter((g) => g.length > 1)
    .map((g) =>
      msg(locale, 'dataManagement.templates.oneOf', {
        fields: g
          .map((k) => {
            const f = schema.fields.find((x) => x.key === k);
            return f ? fieldLabel(f, locale) : k;
          })
          .join(locale === 'ar' ? ' أو ' : ' or '),
      }),
    );
}

function listValues(field: FieldDef, locale: MessageLocale): string[] | null {
  if (field.type === 'enum' && field.enumKind) {
    const src = ENUMS[field.enumKind];
    return src.values.map((v) => (locale === 'ar' ? src.ar[v] : src.en[v]) ?? v);
  }
  if (field.type === 'gender') return locale === 'ar' ? ['ذكر', 'أنثى'] : ['Male', 'Female'];
  if (field.type === 'boolean' || field.type === 'outsideKingdom') return locale === 'ar' ? ['نعم', 'لا'] : ['Yes', 'No'];
  return null;
}

function formatHint(field: FieldDef, locale: MessageLocale): string {
  const key = `dataManagement.templates.formats.${field.type}`;
  const base = msg(locale, key);
  const list = listValues(field, locale);
  return list ? `${base}: ${list.join(locale === 'ar' ? '، ' : ', ')}` : base;
}

function exampleValue(field: FieldDef, locale: MessageLocale): JsonCell | Date {
  const v = field.example?.[locale] ?? null;
  if (v === '' || v === null) return null;
  if (field.type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d));
  }
  return v;
}

export async function buildTemplate(type: ImportType, locale: MessageLocale, headerColor = '#0F5E6B'): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const schema = getSchema(type);
  const fields = schema.fields.filter((f) => f.template !== false);
  const rtl = locale === 'ar';
  const fill = headerColor.replace('#', '').toUpperCase();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR Portal';
  wb.created = new Date();

  const title = msg(locale, `dataManagement.types.${type}.title`);
  const ws = wb.addWorksheet(title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1, rightToLeft: rtl }] });
  const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });

  ws.columns = fields.map((f) => ({
    header: fieldLabel(f, locale),
    key: f.key,
    width: Math.max(14, Math.min(34, fieldLabel(f, locale).length + 6)),
  }));

  const header = ws.getRow(1);
  header.height = 26;
  fields.forEach((f, i) => {
    const cell = header.getCell(i + 1);
    const required = isRequired(type, f.key) || schema.requiredAnyOf.some((g) => g.includes(f.key));
    cell.font = { bold: true, color: { argb: required ? 'FF1B1B1B' : 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FFE6C98F' : `FF${fill}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, readingOrder: rtl ? 'rtl' : 'ltr' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCFD8DB' } } };
    cell.note = {
      texts: [{ text: `${required ? `${msg(locale, 'dataManagement.templates.requiredMark')} — ` : ''}${formatHint(f, locale)}` }],
    };
  });

  // Example row (skipped automatically on import).
  const example: Record<string, unknown> = {};
  for (const f of fields) example[f.key] = exampleValue(f, locale);
  const exRow = ws.addRow(example);
  exRow.font = { italic: true, color: { argb: 'FF7A8A8F' } };
  exRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F6' } };
    cell.alignment = { readingOrder: rtl ? 'rtl' : 'ltr' };
  });
  exRow.getCell(1).note = { texts: [{ text: msg(locale, 'dataManagement.templates.exampleNote') }] };

  // Formats, lists and data validation for 1,000 rows.
  const LAST = 1001;
  let listCol = 1;
  fields.forEach((f, i) => {
    const col = ws.getColumn(i + 1);
    if (f.type === 'date') col.numFmt = 'yyyy-mm-dd';
    if (f.type === 'identifier' || f.type === 'phone') col.numFmt = '@';
    const values = listValues(f, locale);
    if (values) {
      values.forEach((v, r) => {
        lists.getCell(r + 1, listCol).value = v;
      });
      const letter = lists.getColumn(listCol).letter;
      const colLetter = ws.getColumn(i + 1).letter;
      for (let r = 2; r <= LAST; r++) {
        ws.getCell(`${colLetter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${letter}$1:$${letter}$${values.length}`],
          showErrorMessage: false,
        };
      }
      listCol++;
    }
  });

  // Instructions (bilingual).
  const guide = wb.addWorksheet(msg(locale, 'dataManagement.templates.instructionsSheet').slice(0, 31), { views: [{ rightToLeft: rtl }] });
  guide.columns = [
    { key: 'ar', width: 34 },
    { key: 'en', width: 34 },
    { key: 'req', width: 14 },
    { key: 'fmtAr', width: 46 },
    { key: 'fmtEn', width: 46 },
  ];
  const t1 = guide.addRow({ ar: msg('ar', 'dataManagement.templates.instructionsTitle', { type: msg('ar', `dataManagement.types.${type}.title`) }), en: msg('en', 'dataManagement.templates.instructionsTitle', { type: msg('en', `dataManagement.types.${type}.title`) }) });
  t1.font = { bold: true, size: 14 };
  guide.addRow({});
  const rulesAr = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5', ...(type === 'employees' ? ['ruleEmployees1', 'ruleEmployees2', 'ruleEmployees3'] : [])];
  for (const key of rulesAr) {
    const r = guide.addRow({ ar: msg('ar', `dataManagement.templates.rules.${key}`), en: msg('en', `dataManagement.templates.rules.${key}`) });
    r.alignment = { wrapText: true, vertical: 'top' };
    r.getCell('ar').alignment = { wrapText: true, vertical: 'top', readingOrder: 'rtl', horizontal: 'right' };
  }
  for (const note of requiredGroupNote(type, 'ar').map((ar, i) => [ar, requiredGroupNote(type, 'en')[i]!] as const)) {
    const r = guide.addRow({ ar: note[0], en: note[1] });
    r.font = { bold: true };
  }
  guide.addRow({});
  const head = guide.addRow({
    ar: msg('ar', 'dataManagement.templates.columnAr'),
    en: msg('en', 'dataManagement.templates.columnEn'),
    req: `${msg('ar', 'dataManagement.templates.required')} / ${msg('en', 'dataManagement.templates.required')}`,
    fmtAr: msg('ar', 'dataManagement.templates.format'),
    fmtEn: msg('en', 'dataManagement.templates.format'),
  });
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
  });
  for (const f of fields) {
    const required = isRequired(type, f.key);
    const inGroup = schema.requiredAnyOf.some((g) => g.length > 1 && g.includes(f.key));
    const r = guide.addRow({
      ar: fieldLabel(f, 'ar'),
      en: fieldLabel(f, 'en'),
      req: required ? '✓' : inGroup ? '◐' : '',
      fmtAr: formatHint(f, 'ar'),
      fmtEn: formatHint(f, 'en'),
    });
    r.alignment = { wrapText: true, vertical: 'top' };
    r.getCell('ar').alignment = { wrapText: true, vertical: 'top', readingOrder: 'rtl', horizontal: 'right' };
    r.getCell('fmtAr').alignment = { wrapText: true, vertical: 'top', readingOrder: 'rtl', horizontal: 'right' };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export function templateFileName(type: ImportType, locale: MessageLocale): string {
  return `${msg(locale, `dataManagement.types.${type}.fileName`)}.xlsx`;
}
