/**
 * Row validation for every import type. Produces, per row: normalized values, reference
 * resolutions (existing id / create / in-file), the planned action (create / update / skip) and
 * issues. Field-level problems (bad date, e-mail, list value, unknown department…) are warnings:
 * the field is left empty and — for employees — the original text is preserved in `extra_data`.
 * Row-level problems (missing name, duplicate identifiers, conflicting matches, missing required
 * references) are errors and the row is not imported.
 */
import { codeKey, employeeNumberKey, findRef, type EmployeeRef, type RefIndex, type ValidationContext } from './context';
import { hasArabic, matchKey } from './normalize';
import { enumSynonyms, getSchema, type EntitySchema, type FieldDef } from './schemas';
import {
  EXTRA,
  IGNORE,
  type ColumnMapping,
  type ExtractedTable,
  type ImportOptions,
  type ImportType,
  type Issue,
  type IssueLevel,
  type JsonCell,
  type RowAction,
  type RowResult,
  type TableRow,
  type ValidationTotals,
} from './types';
import {
  cellText,
  identifierText,
  inferDateOrder,
  isBlank,
  isScientificNotation,
  isoToHijri,
  parseBooleanValue,
  parseDateValue,
  parseEmailValue,
  parseEnumValue,
  parseGenderValue,
  parseNumberValue,
  parseOutsideKingdom,
  parsePhoneValue,
  verbatim,
  type DateOrder,
} from './values';

/* ─── Resolutions stored in import_rows.mapped ────────────────────────────── */

export type RefResolution =
  | { kind: 'id'; id: string; label: string }
  | { kind: 'create'; name: string; lang: 'ar' | 'en'; key: string }
  | { kind: 'file'; number?: string | null; nationalId?: string | null; name?: string | null; label: string };

export type MappedRow = {
  /** Normalized values keyed by field. */
  values: Record<string, unknown>;
  refs: Record<string, RefResolution>;
  /** employees.extra_data additions (header label → original value). */
  extra: Record<string, JsonCell>;
  /** Matched existing record. */
  match: { id: string; label: string } | null;
  action: RowAction;
  /** Sub-records: the employee the row belongs to. */
  employee: { id: string; label: string } | null;
};

export type ValidateInput = {
  type: ImportType;
  table: ExtractedTable;
  mapping: readonly ColumnMapping[];
  options: ImportOptions;
  context: ValidationContext;
};

export type ValidationResult = {
  rows: RowResult[];
  totals: ValidationTotals;
  dateOrders: Record<string, DateOrder>;
};

/* ─── Row builder ─────────────────────────────────────────────────────────── */

type ColumnRef = { index: number; label: string };

class RowBuilder {
  errors: Issue[] = [];
  warnings: Issue[] = [];
  values: Record<string, unknown> = {};
  extra: Record<string, JsonCell> = {};
  refs: Record<string, RefResolution> = {};

  constructor(
    readonly row: TableRow,
    private readonly cols: Map<string, ColumnRef>,
    private readonly preserve: boolean,
    private readonly orders: Record<string, DateOrder>,
    readonly today: string,
  ) {}

  mapped(field: string): boolean {
    return this.cols.has(field);
  }

  cell(field: string): JsonCell {
    const col = this.cols.get(field);
    return col ? (this.row.cells[col.index] ?? null) : null;
  }

  column(field: string): string | undefined {
    return this.cols.get(field)?.label;
  }

  issue(level: IssueLevel, code: string, field?: string, params?: Record<string, string | number>, value?: JsonCell): void {
    const issue: Issue = { level, code };
    if (field) {
      issue.field = field;
      const column = this.column(field);
      if (column) issue.column = column;
    }
    if (value !== undefined && value !== null) issue.value = String(cellText(value) ?? value);
    if (params) issue.params = params;
    (level === 'error' ? this.errors : this.warnings).push(issue);
  }

  /** Keeps the original cell in extra_data (employees) under its header label. */
  keep(field: string): void {
    if (!this.preserve) return;
    const col = this.cols.get(field);
    const value = verbatim(this.cell(field));
    if (col && value !== null) this.extra[col.label] = value;
  }

  set(field: string, value: unknown): void {
    if (value !== null && value !== undefined && value !== '') this.values[field] = value;
  }

  text(field: string): string | null {
    const v = cellText(this.cell(field));
    this.set(field, v);
    return v;
  }

  identifier(field: string, required = false): string | null {
    const raw = this.cell(field);
    const v = identifierText(raw);
    if (v && isScientificNotation(v)) {
      this.issue(required ? 'error' : 'warning', 'scientificNotation', field, undefined, raw);
      this.keep(field);
      return null;
    }
    this.set(field, v);
    return v;
  }

  date(field: string, opts: { notFuture?: boolean; notBefore?: string } = {}): string | null {
    const raw = this.cell(field);
    const parsed = parseDateValue(raw, this.orders[field] ?? 'dmy');
    if (!parsed) return null;
    if (!parsed.ok) {
      this.issue('warning', parsed.reason === 'hijriOutOfRange' ? 'hijriOutOfRange' : 'invalidDate', field, undefined, raw);
      this.keep(field);
      return null;
    }
    if (opts.notFuture && parsed.iso > this.today) {
      this.issue('warning', 'futureDate', field, undefined, raw);
      this.keep(field);
      return null;
    }
    if (opts.notBefore && parsed.iso < opts.notBefore) {
      this.issue('warning', 'implausibleDate', field, undefined, raw);
      this.keep(field);
      return null;
    }
    if (parsed.calendar === 'hijri') this.issue('info', 'hijriConverted', field, { date: parsed.iso }, raw);
    this.set(field, parsed.iso);
    return parsed.iso;
  }

  number(field: string, required = false): number | null {
    const raw = this.cell(field);
    const parsed = parseNumberValue(raw);
    if (!parsed) return null;
    if (!parsed.ok) {
      this.issue(required ? 'error' : 'warning', 'invalidNumber', field, undefined, raw);
      this.keep(field);
      return null;
    }
    this.set(field, parsed.value);
    return parsed.value;
  }

  boolean(field: string): boolean | null {
    const raw = this.cell(field);
    const parsed = parseBooleanValue(raw);
    if (!parsed) return null;
    if (!parsed.ok) {
      this.issue('warning', 'invalidBoolean', field, undefined, raw);
      return null;
    }
    this.set(field, parsed.value);
    return parsed.value;
  }

  email(field: string): string | null {
    const raw = this.cell(field);
    const parsed = parseEmailValue(raw);
    if (!parsed) return null;
    if (!parsed.ok) {
      this.issue('warning', 'invalidEmail', field, undefined, raw);
      this.keep(field);
      return null;
    }
    this.set(field, parsed.value);
    return parsed.value;
  }

  phone(field: string): string | null {
    const raw = this.cell(field);
    const parsed = parsePhoneValue(raw);
    if (!parsed) return null;
    if (!parsed.ok) {
      this.issue('warning', 'invalidPhone', field, undefined, raw);
      this.keep(field);
      return null;
    }
    this.set(field, parsed.value);
    return parsed.value;
  }

  enumValue(field: FieldDef, required = false): string | null {
    const raw = this.cell(field.key);
    if (!field.enumKind) return null;
    const parsed = parseEnumValue(raw, enumSynonyms(field.enumKind));
    if (!parsed) return null;
    if (!parsed.ok) {
      this.issue(required ? 'error' : 'warning', 'invalidOption', field.key, undefined, raw);
      this.keep(field.key);
      return null;
    }
    this.set(field.key, parsed.value);
    return parsed.value;
  }

  gender(field: string): 'male' | 'female' | null {
    const raw = this.cell(field);
    const parsed = parseGenderValue(raw);
    if (!parsed) return null;
    if (!parsed.ok) {
      this.issue('warning', 'invalidGender', field, undefined, raw);
      this.keep(field);
      return null;
    }
    this.set(field, parsed.value);
    return parsed.value;
  }

  /** Master-data reference: existing id, or a creation request, or unknown (warning). */
  masterRef(field: string, index: RefIndex, allowCreate: boolean): RefResolution | null {
    const text = cellText(this.cell(field));
    if (!text) return null;
    this.set(field, text);
    const hit = findRef(index, text);
    if (hit) {
      const res: RefResolution = { kind: 'id', id: hit.id, label: hit.name_ar || hit.name_en || hit.code || text };
      this.refs[field] = res;
      return res;
    }
    if (allowCreate) {
      const res: RefResolution = { kind: 'create', name: text, lang: hasArabic(text) ? 'ar' : 'en', key: matchKey(text) };
      this.refs[field] = res;
      this.issue('info', 'willCreate', field, undefined, text);
      return res;
    }
    this.issue('warning', 'unknownReference', field, undefined, text);
    this.keep(field);
    return null;
  }

  /** Required field: escalates its warning (bad value) to an error, or reports it missing. */
  require(field: string): void {
    const i = this.warnings.findIndex((w) => w.field === field && w.level === 'warning');
    if (i >= 0) {
      const [w] = this.warnings.splice(i, 1);
      this.errors.push({ ...w!, level: 'error' });
    } else if (!this.errors.some((e) => e.field === field)) {
      this.issue('error', 'required', field);
    }
  }

  status(): 'valid' | 'warning' | 'error' {
    if (this.errors.length) return 'error';
    return this.warnings.some((w) => w.level === 'warning') ? 'warning' : 'valid';
  }
}

/* ─── In-file indexes ─────────────────────────────────────────────────────── */

type Occurrence = Map<string, number[]>;

function collect(rows: readonly TableRow[], col: ColumnRef | undefined, key: (v: string) => string, read: (v: JsonCell) => string | null = identifierText): Occurrence {
  const map: Occurrence = new Map();
  if (!col) return map;
  for (const row of rows) {
    const v = read(row.cells[col.index] ?? null);
    if (!v) continue;
    const k = key(v);
    const list = map.get(k);
    if (list) list.push(row.rowNumber);
    else map.set(k, [row.rowNumber]);
  }
  return map;
}

function checkDuplicate(b: RowBuilder, field: string, occ: Occurrence, key: string | null, level: 'error' | 'warning' = 'error'): boolean {
  if (!key) return false;
  const rows = occ.get(key);
  if (!rows || rows.length < 2) return false;
  const first = rows[0]!;
  if (b.row.rowNumber === first) {
    b.issue('warning', 'duplicateInFileFirst', field, { rows: rows.slice(1).join(', ') }, b.cell(field));
    return false;
  }
  b.issue(level, 'duplicateInFile', field, { row: first }, b.cell(field));
  return level === 'error';
}

function employeeLabel(e: Pick<EmployeeRef, 'name_ar' | 'name_en' | 'employee_number' | 'national_id'>): string {
  const name = e.name_ar || e.name_en || '';
  const id = e.employee_number || e.national_id || '';
  return name && id ? `${name} (${id})` : name || id;
}

/* ─── Example-row detection (template example rows are skipped) ──────────── */

function isExampleRow(schema: EntitySchema, cols: Map<string, ColumnRef>, row: TableRow): boolean {
  let compared = 0;
  let equal = 0;
  let filled = 0;
  for (const [key, col] of cols) {
    const v = row.cells[col.index] ?? null;
    if (isBlank(v)) continue;
    filled++;
    const field = schema.fields.find((f) => f.key === key);
    if (!field?.example) continue;
    const examples = [field.example.ar, field.example.en].filter((e) => e !== '' && e !== null && e !== undefined);
    if (!examples.length) continue;
    compared++;
    const text = matchKey(cellText(v));
    const date = parseDateValue(v);
    if (
      examples.some((e) => {
        if (matchKey(cellText(e)) === text) return true;
        const ed = parseDateValue(e);
        return Boolean(date && date.ok && ed && ed.ok && date.iso === ed.iso);
      })
    ) {
      equal++;
    }
  }
  return compared >= 3 && equal >= 3 && equal / Math.max(filled, 1) >= 0.7;
}

/* ─── Employee references (manager / head) ────────────────────────────────── */

type FileEmployeeIndex = { byNumber: Map<string, number>; byNationalId: Map<string, number>; byName: Map<string, number | null> };

function fileEmployees(table: ExtractedTable, cols: Map<string, ColumnRef>): FileEmployeeIndex {
  const idx: FileEmployeeIndex = { byNumber: new Map(), byNationalId: new Map(), byName: new Map() };
  const num = cols.get('employee_number');
  const nid = cols.get('national_id');
  const names = [cols.get('name_ar'), cols.get('name_en')].filter(Boolean) as ColumnRef[];
  for (const row of table.rows) {
    const n = num ? identifierText(row.cells[num.index] ?? null) : null;
    if (n && !idx.byNumber.has(employeeNumberKey(n))) idx.byNumber.set(employeeNumberKey(n), row.rowNumber);
    const i = nid ? identifierText(row.cells[nid.index] ?? null) : null;
    if (i && !idx.byNationalId.has(i)) idx.byNationalId.set(i, row.rowNumber);
    for (const c of names) {
      const key = matchKey(cellText(row.cells[c.index] ?? null));
      if (!key) continue;
      idx.byName.set(key, idx.byName.has(key) ? null : row.rowNumber);
    }
  }
  return idx;
}

function resolveEmployeeRef(b: RowBuilder, field: string, ctx: ValidationContext, file: FileEmployeeIndex | null): RefResolution | null {
  const text = cellText(b.cell(field));
  if (!text) return null;
  b.set(field, text);
  const id = identifierText(text) ?? text;
  const db =
    ctx.employees.byNumber.get(employeeNumberKey(id)) ?? ctx.employees.byNationalId.get(id) ?? ctx.employees.byName.get(matchKey(text)) ?? null;
  if (db) {
    const res: RefResolution = { kind: 'id', id: db.id, label: employeeLabel(db) };
    b.refs[field] = res;
    return res;
  }
  if (file) {
    const rowNo = file.byNumber.get(employeeNumberKey(id)) ?? file.byNationalId.get(id) ?? file.byName.get(matchKey(text)) ?? null;
    if (rowNo) {
      if (rowNo === b.row.rowNumber) {
        b.issue('warning', 'selfReference', field, undefined, text);
        return null;
      }
      const res: RefResolution = {
        kind: 'file',
        number: file.byNumber.has(employeeNumberKey(id)) ? id : null,
        nationalId: file.byNationalId.has(id) ? id : null,
        name: file.byName.has(matchKey(text)) ? text : null,
        label: text,
      };
      b.refs[field] = res;
      b.issue('info', 'referenceInFile', field, { row: rowNo }, text);
      return res;
    }
  }
  b.issue('warning', 'unknownEmployee', field, undefined, text);
  b.keep(field);
  return null;
}

/** Sub-record owner: by employee number, then Iqama / national ID (must exist). */
function resolveOwner(b: RowBuilder, ctx: ValidationContext): EmployeeRef | null {
  const number = b.identifier('employee_number');
  const nid = b.identifier('employee_national_id');
  b.text('employee_name');
  if (!number && !nid) {
    b.issue('error', 'employeeRefRequired');
    return null;
  }
  const byNum = number ? ctx.employees.byNumber.get(employeeNumberKey(number)) : undefined;
  const byId = nid ? ctx.employees.byNationalId.get(nid) : undefined;
  if (byNum && byId && byNum.id !== byId.id) {
    b.issue('error', 'matchConflict', undefined, { number: number ?? '', nationalId: nid ?? '' });
    return null;
  }
  const emp = byNum ?? byId ?? null;
  if (!emp) {
    b.issue('error', 'employeeNotFound', number ? 'employee_number' : 'employee_national_id', undefined, number ?? nid);
    return null;
  }
  if (emp.archived_at) b.issue('warning', 'archivedEmployee', undefined, { name: employeeLabel(emp) });
  return emp;
}

/* ─── Entity validators ───────────────────────────────────────────────────── */

type EntityState = {
  schema: EntitySchema;
  ctx: ValidationContext;
  options: ImportOptions;
  table: ExtractedTable;
  cols: Map<string, ColumnRef>;
  occ: Record<string, Occurrence>;
  file: FileEmployeeIndex | null;
};

type Outcome = { action: RowAction; match: MappedRow['match']; employee?: MappedRow['employee'] };

function field(schema: EntitySchema, key: string): FieldDef {
  return schema.fields.find((f) => f.key === key)!;
}

function existingAction(options: ImportOptions): RowAction {
  return options.existing === 'update' ? 'update' : 'skip';
}

function validateEmployee(b: RowBuilder, s: EntityState): Outcome {
  const { ctx, options, schema, occ } = s;
  const number = b.identifier('employee_number');
  const nameAr = b.text('name_ar');
  const nameEn = b.text('name_en');
  if (!nameAr && !nameEn) b.issue('error', 'nameRequired');
  const nid = b.identifier('national_id');
  if (nid && !/^\d{10}$/.test(nid)) b.issue('warning', 'unusualNationalId', 'national_id', undefined, nid);

  // ID type: explicit column, else derived from the number (1… = Saudi national ID, 2… = Iqama).
  const idType = b.enumValue(field(schema, 'id_type'));
  if (!idType && nid && /^[12]\d{9}$/.test(nid)) b.set('id_type', nid.startsWith('1') ? 'national_id' : 'iqama');

  b.gender('gender');
  b.text('nationality');
  const dob = b.date('date_of_birth', { notFuture: true, notBefore: '1900-01-01' });
  if (dob && dob > shiftYears(ctx.today, -14)) b.issue('warning', 'implausibleAge', 'date_of_birth', undefined, dob);
  b.enumValue(field(schema, 'marital_status'));
  const email = b.email('company_email');
  b.email('personal_email');
  b.phone('mobile');
  b.phone('alt_mobile');
  b.text('address');
  b.text('division');
  b.text('section');
  const profession = b.text('iqama_profession');
  b.text('grade');
  b.enumValue(field(schema, 'employment_type'));
  const status = b.enumValue(field(schema, 'employment_status'));
  b.date('joining_date');
  b.date('probation_end_date');
  const cStart = b.date('contract_start_date');
  const cEnd = b.date('contract_end_date');
  if (cStart && cEnd && cEnd < cStart) {
    b.issue('warning', 'endBeforeStart', 'contract_end_date', undefined, b.cell('contract_end_date'));
    b.keep('contract_end_date');
    delete b.values.contract_end_date;
  }
  const issue = b.date('iqama_issue_date', { notFuture: true });
  b.identifier('passport_number');
  b.date('passport_expiry_date');
  b.identifier('employer_number');
  b.text('emergency_contact_name');
  b.text('emergency_contact_relationship');
  b.phone('emergency_contact_mobile');

  // Iqama expiry: Gregorian column, Hijri text column, or both.
  let expiry = b.date('iqama_expiry_date');
  const expiryRaw = b.cell('iqama_expiry_date');
  const expiryParsed = parseDateValue(expiryRaw);
  const hijriRaw = b.cell('iqama_expiry_hijri');
  const hijriText = cellText(hijriRaw);
  if (hijriText) {
    b.set('iqama_expiry_hijri', hijriText);
    const parsed = parseDateValue(hijriRaw);
    if (!parsed || !parsed.ok) {
      b.issue('warning', parsed && !parsed.ok && parsed.reason === 'hijriOutOfRange' ? 'hijriOutOfRange' : 'invalidHijri', 'iqama_expiry_hijri', undefined, hijriRaw);
    } else if (parsed.calendar !== 'hijri') {
      b.issue('warning', 'notHijri', 'iqama_expiry_hijri', undefined, hijriRaw);
    } else if (!expiry) {
      if (!b.mapped('iqama_expiry_date') || isBlank(expiryRaw)) {
        expiry = parsed.iso;
        b.set('iqama_expiry_date', parsed.iso);
        b.issue('info', 'hijriConverted', 'iqama_expiry_date', { date: parsed.iso }, hijriRaw);
      }
    } else if (Math.abs(daysDiff(expiry, parsed.iso)) > 2) {
      b.issue('warning', 'hijriMismatch', 'iqama_expiry_hijri', { date: expiry, converted: parsed.iso }, hijriRaw);
    }
  } else if (expiryParsed && expiryParsed.ok && expiryParsed.calendar === 'hijri') {
    // Hijri value in the Gregorian column: keep the Hijri text as provided too.
    b.set('iqama_expiry_hijri', cellText(expiryRaw));
  }
  if (expiry && issue && expiry < issue) b.issue('warning', 'endBeforeStart', 'iqama_expiry_date', undefined, expiry);

  // Outside the Kingdom (original text always kept in extra_data).
  if (b.mapped('is_outside_kingdom') && !isBlank(b.cell('is_outside_kingdom'))) {
    const raw = b.cell('is_outside_kingdom');
    const parsed = parseOutsideKingdom(raw);
    b.keep('is_outside_kingdom');
    if (parsed && parsed.ok) b.values.is_outside_kingdom = parsed.value;
    else b.issue('warning', 'invalidOutsideKingdom', 'is_outside_kingdom', undefined, raw);
  } else if (b.mapped('inside_kingdom') && !isBlank(b.cell('inside_kingdom'))) {
    const raw = b.cell('inside_kingdom');
    const text = matchKey(cellText(raw));
    const explicit = /خارج|داخل|outside|inside/.test(text) ? parseOutsideKingdom(raw) : null;
    const bool = parseBooleanValue(raw);
    b.keep('inside_kingdom');
    if (explicit && explicit.ok) b.values.is_outside_kingdom = explicit.value;
    else if (bool && bool.ok) b.values.is_outside_kingdom = !bool.value;
    else b.issue('warning', 'invalidOutsideKingdom', 'inside_kingdom', undefined, raw);
  }

  // Leave balance (current-year annual leave opening balance).
  const leave = b.number('leave_balance');
  if (leave !== null) {
    if (!ctx.can.leaveEdit) b.issue('warning', 'leaveBalanceNoPermission', 'leave_balance');
    else if (!findRef(ctx.leaveTypes, 'annual')) b.issue('warning', 'annualLeaveTypeMissing', 'leave_balance');
    else if (leave < 0) b.issue('warning', 'negativeBalance', 'leave_balance', undefined, leave);
  }

  // Master-data references.
  const create = options.createMissingMasterData && ctx.can.settingsEdit;
  b.masterRef('department', ctx.departments, create);
  const title = b.masterRef('job_title', ctx.jobTitles, create);
  if (!title && options.professionAsJobTitle && profession && !b.values.job_title) {
    const hit = findRef(ctx.jobTitles, profession);
    if (hit) b.refs.job_title = { kind: 'id', id: hit.id, label: hit.name_ar || hit.name_en || profession };
    else if (ctx.can.settingsEdit) {
      b.refs.job_title = { kind: 'create', name: profession, lang: hasArabic(profession) ? 'ar' : 'en', key: matchKey(profession) };
      b.issue('info', 'willCreate', 'job_title', undefined, profession);
    }
  }
  b.masterRef('location', ctx.locations, create);
  b.masterRef('cost_center', ctx.costCenters, create);
  resolveEmployeeRef(b, 'manager', ctx, s.file);

  // Duplicates within the file.
  checkDuplicate(b, 'employee_number', occ.employee_number!, number ? employeeNumberKey(number) : null);
  checkDuplicate(b, 'national_id', occ.national_id!, nid);
  checkDuplicate(b, 'passport_number', occ.passport_number!, (b.values.passport_number as string | undefined)?.toUpperCase() ?? null, 'warning');
  checkDuplicate(b, 'company_email', occ.company_email!, email, 'warning');

  // Existing employees (by employee number, then Iqama / national ID).
  const byNum = number ? ctx.employees.byNumber.get(employeeNumberKey(number)) : undefined;
  const byId = nid ? ctx.employees.byNationalId.get(nid) : undefined;
  if (byNum && byId && byNum.id !== byId.id) {
    b.issue('error', 'matchConflict', undefined, { number: number ?? '', nationalId: nid ?? '' });
    return { action: 'skip', match: null };
  }
  const match = byNum ?? byId ?? null;
  if (!status && !match) b.set('employment_status', options.defaultEmploymentStatus);
  if (match) {
    const action = existingAction(options);
    b.issue('info', action === 'update' ? 'existingWillUpdate' : 'existingWillSkip', byNum ? 'employee_number' : 'national_id', { name: employeeLabel(match) });
    if (match.archived_at) b.issue('warning', 'archivedEmployee', undefined, { name: employeeLabel(match) });
    if (action === 'update' && !ctx.can.personalDataEdit) b.issue('warning', 'personalDataNotUpdated');
    return { action, match: { id: match.id, label: employeeLabel(match) } };
  }
  return { action: 'create', match: null };
}

function validateMaster(b: RowBuilder, s: EntityState, index: RefIndex): Outcome {
  const code = b.identifier('code');
  const nameAr = b.text('name_ar');
  const nameEn = b.text('name_en');
  if (!nameAr && !nameEn) b.issue('error', 'nameRequired');
  if (s.schema.fields.some((f) => f.key === 'city')) {
    b.text('city');
    b.text('country');
  }
  b.boolean('is_active');
  checkDuplicate(b, 'code', s.occ.code!, code ? codeKey(code) : null);
  const nameKey = matchKey(nameAr ?? nameEn);
  if (!code) checkDuplicate(b, nameAr ? 'name_ar' : 'name_en', s.occ.name!, nameKey || null);

  if (s.ctx.type === 'departments') {
    const parent = cellText(b.cell('parent'));
    if (parent) {
      b.set('parent', parent);
      const hit = findRef(s.ctx.departments, parent);
      const inFile = s.occ.code!.has(codeKey(parent)) || s.occ.name!.has(matchKey(parent));
      if (hit) b.refs.parent = { kind: 'id', id: hit.id, label: hit.name_ar || hit.name_en || parent };
      else if (inFile) {
        b.refs.parent = { kind: 'file', name: parent, label: parent };
        b.issue('info', 'referenceInFile', 'parent', { row: (s.occ.code!.get(codeKey(parent)) ?? s.occ.name!.get(matchKey(parent)) ?? [0])[0]! }, parent);
      } else {
        b.issue('warning', 'unknownReference', 'parent', undefined, parent);
      }
      if ((code && codeKey(parent) === codeKey(code)) || (nameKey && matchKey(parent) === nameKey)) {
        delete b.refs.parent;
        b.issue('warning', 'selfReference', 'parent', undefined, parent);
      }
    }
    resolveEmployeeRef(b, 'head', s.ctx, null);
  }

  const match = (code ? index.byCode.get(codeKey(code)) : undefined) ?? (nameKey ? index.byName.get(nameKey) : undefined) ?? null;
  if (match) {
    const action = existingAction(s.options);
    b.issue('info', action === 'update' ? 'existingWillUpdate' : 'existingWillSkip', code ? 'code' : undefined, { name: match.name_ar || match.name_en || match.code || '' });
    return { action, match: { id: match.id, label: match.name_ar || match.name_en || match.code || '' } };
  }
  return { action: 'create', match: null };
}

function validateLeaveBalance(b: RowBuilder, s: EntityState): Outcome {
  const emp = resolveOwner(b, s.ctx);
  const typeText = cellText(b.cell('leave_type'));
  let leaveTypeId: string | null = null;
  if (!typeText) b.require('leave_type');
  else {
    b.set('leave_type', typeText);
    const hit = findRef(s.ctx.leaveTypes, typeText);
    if (!hit) b.issue('error', 'unknownLeaveType', 'leave_type', undefined, typeText);
    else {
      leaveTypeId = hit.id;
      b.refs.leave_type = { kind: 'id', id: hit.id, label: hit.name_ar || hit.name_en || hit.code || typeText };
    }
  }
  let year = s.options.leaveYear;
  const yearRaw = b.cell('year');
  if (!isBlank(yearRaw)) {
    const parsed = parseNumberValue(yearRaw);
    if (!parsed || !parsed.ok || !Number.isInteger(parsed.value) || parsed.value < 2000 || parsed.value > 2200) b.issue('error', 'invalidYear', 'year', undefined, yearRaw);
    else year = parsed.value;
  }
  b.values.year = year;
  const opening = b.number('opening_balance', true);
  if (opening === null) b.require('opening_balance');
  if (opening !== null && opening < 0) b.issue('warning', 'negativeBalance', 'opening_balance', undefined, opening);
  const entitlement = b.number('entitlement');
  if (entitlement !== null && entitlement < 0) b.issue('error', 'invalidNumber', 'entitlement', undefined, entitlement);
  if (!s.ctx.can.leaveEdit) b.issue('error', 'leaveBalanceNoPermission');

  const dupKey = emp && leaveTypeId ? `${emp.id}:${leaveTypeId}:${year}` : null;
  if (dupKey) {
    const occ = s.occ.balance!;
    const rows = occ.get(dupKey) ?? [];
    if (!rows.length) occ.set(dupKey, [b.row.rowNumber]);
    else {
      rows.push(b.row.rowNumber);
      b.issue('error', 'duplicateInFile', 'leave_type', { row: rows[0]! }, typeText);
    }
  }
  const employee = emp ? { id: emp.id, label: employeeLabel(emp) } : null;
  const existing = dupKey ? s.ctx.leaveBalances.get(dupKey) : undefined;
  if (existing) {
    const action = existingAction(s.options);
    b.issue('info', action === 'update' ? 'existingWillUpdate' : 'existingWillSkip', 'leave_type', { name: employee?.label ?? '' });
    return { action, match: { id: existing, label: employee?.label ?? '' }, employee };
  }
  return { action: 'create', match: null, employee };
}

function validateDependent(b: RowBuilder, s: EntityState): Outcome {
  const emp = resolveOwner(b, s.ctx);
  const nameAr = b.text('name_ar');
  const nameEn = b.text('name_en');
  if (!nameAr && !nameEn) b.issue('error', 'nameRequired');
  const rel = b.enumValue(field(s.schema, 'relationship'), true);
  if (!rel) b.require('relationship');
  b.date('date_of_birth', { notFuture: true, notBefore: '1900-01-01' });
  b.text('nationality');
  const nid = b.identifier('national_id');
  b.date('iqama_expiry_date');
  b.identifier('passport_number');
  b.date('passport_expiry_date');
  b.enumValue(field(s.schema, 'insurance_status'));
  b.identifier('insurance_member_number');
  b.text('notes');
  const employee = emp ? { id: emp.id, label: employeeLabel(emp) } : null;
  if (!emp) return { action: 'skip', match: null, employee };
  const key = `${emp.id}:${nid ?? matchKey(nameAr ?? nameEn)}`;
  const occ = s.occ.dependent!;
  const rows = occ.get(key) ?? [];
  rows.push(b.row.rowNumber);
  occ.set(key, rows);
  if (rows.length > 1) b.issue('error', 'duplicateInFile', nid ? 'national_id' : 'name_ar', { row: rows[0]! }, nid ?? nameAr ?? nameEn);
  const existing = (s.ctx.dependents.get(emp.id) ?? []).find(
    (d) => (nid && d.national_id === nid) || (!nid && [d.name_ar, d.name_en].some((n) => n && matchKey(n) === matchKey(nameAr ?? nameEn))),
  );
  if (existing) {
    const action = existingAction(s.options);
    b.issue('info', action === 'update' ? 'existingWillUpdate' : 'existingWillSkip', undefined, { name: existing.name_ar || existing.name_en || '' });
    return { action, match: { id: existing.id, label: existing.name_ar || existing.name_en || '' }, employee };
  }
  return { action: 'create', match: null, employee };
}

function validateInsurance(b: RowBuilder, s: EntityState): Outcome {
  const emp = resolveOwner(b, s.ctx);
  const depName = b.text('dependent_name');
  b.text('provider');
  const policy = b.identifier('policy_number');
  b.text('class');
  const member = b.identifier('member_number');
  const start = b.date('start_date');
  const end = b.date('expiry_date');
  if (start && end && end < start) {
    b.issue('warning', 'endBeforeStart', 'expiry_date', undefined, end);
  }
  const status = b.enumValue(field(s.schema, 'status'));
  if (!status) b.values.status = end && end < s.ctx.today ? 'expired' : 'active';
  const employee = emp ? { id: emp.id, label: employeeLabel(emp) } : null;
  if (!emp) return { action: 'skip', match: null, employee };
  let dependentId: string | null = null;
  if (depName) {
    const dep = (s.ctx.dependents.get(emp.id) ?? []).find((d) => [d.name_ar, d.name_en].some((n) => n && matchKey(n) === matchKey(depName)));
    if (dep) {
      dependentId = dep.id;
      b.refs.dependent_name = { kind: 'id', id: dep.id, label: dep.name_ar || dep.name_en || depName };
    } else b.issue('warning', 'unknownDependent', 'dependent_name', undefined, depName);
  }
  const existing = (s.ctx.insurance.get(emp.id) ?? []).find(
    (r) => (member && r.member_number === member) || (!member && policy && r.policy_number === policy && r.dependent_id === dependentId),
  );
  if (existing) {
    const action = existingAction(s.options);
    b.issue('info', action === 'update' ? 'existingWillUpdate' : 'existingWillSkip', member ? 'member_number' : 'policy_number', { name: employee?.label ?? '' });
    return { action, match: { id: existing.id, label: member ?? policy ?? '' }, employee };
  }
  return { action: 'create', match: null, employee };
}

function validateDocument(b: RowBuilder, s: EntityState): Outcome {
  const emp = resolveOwner(b, s.ctx);
  const type = b.enumValue(field(s.schema, 'document_type'), true);
  if (!type) b.require('document_type');
  const number = b.identifier('document_number');
  const issue = b.date('issue_date');
  const expiry = b.date('expiry_date');
  if (issue && expiry && expiry < issue) b.issue('warning', 'endBeforeStart', 'expiry_date', undefined, expiry);
  const status = b.enumValue(field(s.schema, 'status'));
  if (!status) b.values.status = expiry && expiry < s.ctx.today ? 'expired' : 'valid';
  b.text('notes');
  const employee = emp ? { id: emp.id, label: employeeLabel(emp) } : null;
  if (!emp || !type) return { action: 'skip', match: null, employee };
  if (number) {
    const key = `${emp.id}:${type}:${number}`;
    const occ = s.occ.document!;
    const rows = occ.get(key) ?? [];
    rows.push(b.row.rowNumber);
    occ.set(key, rows);
    if (rows.length > 1) b.issue('error', 'duplicateInFile', 'document_number', { row: rows[0]! }, number);
    const existing = (s.ctx.documents.get(emp.id) ?? []).find((d) => d.document_type === type && d.document_number === number);
    if (existing) {
      const action = existingAction(s.options);
      b.issue('info', action === 'update' ? 'existingWillUpdate' : 'existingWillSkip', 'document_number', { name: employee?.label ?? '' });
      return { action, match: { id: existing.id, label: number }, employee };
    }
  }
  return { action: 'create', match: null, employee };
}

function validateHoliday(b: RowBuilder, s: EntityState): Outcome {
  const nameAr = b.text('name_ar');
  const nameEn = b.text('name_en');
  if (!nameAr && !nameEn) b.issue('error', 'nameRequired');
  const start = b.date('start_date');
  if (!start) b.require('start_date');
  let end = b.date('end_date');
  if (start && !end) {
    end = start;
    b.values.end_date = start;
  }
  if (start && end && end < start) b.issue('error', 'endBeforeStart', 'end_date', undefined, end);
  b.boolean('is_active');
  const nameKey = matchKey(nameAr ?? nameEn);
  if (start) {
    const key = `${start}:${nameKey}`;
    const occ = s.occ.holiday!;
    const rows = occ.get(key) ?? [];
    rows.push(b.row.rowNumber);
    occ.set(key, rows);
    if (rows.length > 1) b.issue('error', 'duplicateInFile', 'start_date', { row: rows[0]! }, start);
    const existing = s.ctx.holidays.find((h) => h.start_date === start && [h.name_ar, h.name_en].some((n) => n && matchKey(n) === nameKey));
    if (existing) {
      const action = existingAction(s.options);
      b.issue('info', action === 'update' ? 'existingWillUpdate' : 'existingWillSkip', undefined, { name: existing.name_ar || existing.name_en || '' });
      return { action, match: { id: existing.id, label: existing.name_ar || existing.name_en || '' } };
    }
  }
  return { action: 'create', match: null };
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function daysDiff(a: string, b: string): number {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${String(y + years).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function computeTotals(rows: readonly Pick<RowResult, 'status' | 'action'>[]): ValidationTotals {
  const t: ValidationTotals = { total: rows.length, valid: 0, warning: 0, error: 0, create: 0, update: 0, skip: 0 };
  for (const r of rows) {
    if (r.status === 'error') t.error++;
    else if (r.status === 'warning') t.warning++;
    else if (r.status === 'valid') t.valid++;
    if (r.status !== 'error') {
      if (r.action === 'create') t.create++;
      else if (r.action === 'update') t.update++;
      else t.skip++;
    }
  }
  return t;
}

/* ─── Entry point ─────────────────────────────────────────────────────────── */

export function validateImport(input: ValidateInput): ValidationResult {
  const { type, table, mapping, options, context: ctx } = input;
  const schema = getSchema(type);
  const cols = new Map<string, ColumnRef>();
  for (const m of mapping) {
    if (m.target !== IGNORE && m.target !== EXTRA && schema.fields.some((f) => f.key === m.target)) cols.set(m.target, { index: m.index, label: m.label });
  }
  const extraCols = schema.extraData ? mapping.filter((m) => m.target === EXTRA) : [];

  const dateOrders: Record<string, DateOrder> = {};
  for (const f of schema.fields) {
    if (f.type !== 'date' && f.type !== 'hijri') continue;
    const col = cols.get(f.key);
    if (col) dateOrders[f.key] = inferDateOrder(table.rows.map((r) => r.cells[col.index] ?? null));
  }

  const idKey = (v: string) => v;
  const occ: Record<string, Occurrence> = {
    employee_number: collect(table.rows, cols.get('employee_number'), employeeNumberKey),
    national_id: collect(table.rows, cols.get('national_id'), idKey),
    passport_number: collect(table.rows, cols.get('passport_number'), (v) => v.toUpperCase()),
    company_email: collect(table.rows, cols.get('company_email'), idKey, (v) => {
      const e = parseEmailValue(v);
      return e && e.ok ? e.value : null;
    }),
    code: collect(table.rows, cols.get('code'), codeKey),
    name: new Map(),
    balance: new Map(),
    dependent: new Map(),
    document: new Map(),
    holiday: new Map(),
  };
  if (!cols.get('code')) {
    const nameCol = cols.get('name_ar') ?? cols.get('name_en');
    occ.name = collect(table.rows, nameCol, (v) => matchKey(v), (v) => cellText(v));
  } else {
    // Parent lookups by name need every name in the file.
    const names: Occurrence = new Map();
    for (const c of [cols.get('name_ar'), cols.get('name_en')]) {
      for (const [k, v] of collect(table.rows, c, (x) => matchKey(x), (x) => cellText(x))) names.set(k, [...(names.get(k) ?? []), ...v]);
    }
    occ.name = names;
  }
  const state: EntityState = {
    schema,
    ctx,
    options,
    table,
    cols,
    occ,
    file: type === 'employees' ? fileEmployees(table, cols) : null,
  };

  const rows: RowResult[] = table.rows.map((row) => {
    const raw: Record<string, JsonCell> = {};
    for (const col of table.columns) {
      const v = row.cells[col.index] ?? null;
      if (!isBlank(v)) raw[col.label] = v;
    }
    const b = new RowBuilder(row, cols, schema.extraData, dateOrders, ctx.today);

    if (isExampleRow(schema, cols, row)) {
      b.issue('info', 'exampleRow');
      const mapped: MappedRow = { values: {}, refs: {}, extra: {}, match: null, action: 'skip', employee: null };
      return { rowNumber: row.rowNumber, raw, mapped: mapped as unknown as Record<string, unknown>, status: 'skipped', action: 'skip', errors: [], warnings: b.warnings };
    }

    let outcome: Outcome;
    switch (type) {
      case 'employees':
        outcome = validateEmployee(b, state);
        break;
      case 'departments':
        outcome = validateMaster(b, state, ctx.departments);
        break;
      case 'job_titles':
        outcome = validateMaster(b, state, ctx.jobTitles);
        break;
      case 'locations':
        outcome = validateMaster(b, state, ctx.locations);
        break;
      case 'cost_centers':
        outcome = validateMaster(b, state, ctx.costCenters);
        break;
      case 'leave_balances':
        outcome = validateLeaveBalance(b, state);
        break;
      case 'dependents':
        outcome = validateDependent(b, state);
        break;
      case 'insurance':
        outcome = validateInsurance(b, state);
        break;
      case 'documents':
        outcome = validateDocument(b, state);
        break;
      case 'public_holidays':
        outcome = validateHoliday(b, state);
        break;
    }

    for (const col of extraCols) {
      const v = verbatim(row.cells[col.index] ?? null);
      if (v !== null) b.extra[col.label] = v;
    }
    const status = b.status();
    const mapped: MappedRow = {
      values: b.values,
      refs: b.refs,
      extra: b.extra,
      match: outcome.match,
      action: status === 'error' ? 'skip' : outcome.action,
      employee: outcome.employee ?? null,
    };
    return {
      rowNumber: row.rowNumber,
      raw,
      mapped: mapped as unknown as Record<string, unknown>,
      status,
      action: mapped.action,
      errors: b.errors,
      warnings: b.warnings,
    };
  });

  return { rows, totals: computeTotals(rows), dateOrders };
}

/** Hijri text for a Gregorian date — exposed for previews. */
export { isoToHijri };
