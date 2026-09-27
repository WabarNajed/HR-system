/**
 * Database lookups used by validation (existing employees, master data, leave types, sub-records).
 * Works with any Supabase client: the signed-in user's (RLS) in the app, the service role in CLIs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { matchKey } from './normalize';
import type { ImportType } from './types';

export type DbClient = SupabaseClient<Database>;

export type RefRow = { id: string; code: string | null; name_ar: string | null; name_en: string | null };

export type RefIndex = {
  rows: RefRow[];
  byCode: Map<string, RefRow>;
  byName: Map<string, RefRow>;
};

export type EmployeeRef = {
  id: string;
  employee_number: string | null;
  national_id: string | null;
  name_ar: string | null;
  name_en: string | null;
  archived_at: string | null;
};

export type EmployeeIndex = {
  count: number;
  byNumber: Map<string, EmployeeRef>;
  byNationalId: Map<string, EmployeeRef>;
  /** Unique folded names only (ambiguous names are removed). */
  byName: Map<string, EmployeeRef>;
};

export type ValidationContext = {
  type: ImportType;
  today: string;
  employees: EmployeeIndex;
  departments: RefIndex;
  jobTitles: RefIndex;
  locations: RefIndex;
  costCenters: RefIndex;
  leaveTypes: RefIndex & { defaults: Map<string, number> };
  /** employee id → dependents */
  dependents: Map<string, Array<{ id: string; name_ar: string | null; name_en: string | null; national_id: string | null }>>;
  insurance: Map<string, Array<{ id: string; dependent_id: string | null; member_number: string | null; policy_number: string | null }>>;
  documents: Map<string, Array<{ id: string; document_type: string; document_number: string | null }>>;
  holidays: Array<{ id: string; name_ar: string | null; name_en: string | null; start_date: string }>;
  /** `${employee_id}:${leave_type_id}:${year}` → balance id */
  leaveBalances: Map<string, string>;
  /** What the actor may write (the database enforces it too). */
  can: { leaveEdit: boolean; personalDataEdit: boolean; settingsEdit: boolean };
};

/** Employee numbers compare case-insensitively without spaces. */
export function employeeNumberKey(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function codeKey(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function indexRefs(rows: RefRow[]): RefIndex {
  const byCode = new Map<string, RefRow>();
  const byName = new Map<string, RefRow>();
  for (const row of rows) {
    if (row.code) byCode.set(codeKey(row.code), row);
    for (const name of [row.name_ar, row.name_en]) {
      const key = matchKey(name);
      if (key && !byName.has(key)) byName.set(key, row);
    }
  }
  return { rows, byCode, byName };
}

/** Finds master data by code first, then by (folded) Arabic or English name. */
export function findRef(index: RefIndex, value: string): RefRow | null {
  return index.byCode.get(codeKey(value)) ?? index.byName.get(matchKey(value)) ?? null;
}

async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000, max = 100_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function loadEmployeeIndex(client: DbClient): Promise<EmployeeIndex> {
  const rows = await pageAll<EmployeeRef>((from, to) =>
    client.from('employees').select('id, employee_number, national_id, name_ar, name_en, archived_at').order('id').range(from, to),
  );
  const byNumber = new Map<string, EmployeeRef>();
  const byNationalId = new Map<string, EmployeeRef>();
  const byName = new Map<string, EmployeeRef>();
  const ambiguous = new Set<string>();
  for (const e of rows) {
    if (e.employee_number) byNumber.set(employeeNumberKey(e.employee_number), e);
    if (e.national_id) byNationalId.set(e.national_id.trim(), e);
    for (const n of [e.name_ar, e.name_en]) {
      const key = matchKey(n);
      if (!key) continue;
      if (byName.has(key) && byName.get(key)!.id !== e.id) ambiguous.add(key);
      else byName.set(key, e);
    }
  }
  for (const key of ambiguous) byName.delete(key);
  return { count: rows.length, byNumber, byNationalId, byName };
}

async function loadRefs(client: DbClient, table: 'departments' | 'job_titles' | 'locations' | 'cost_centers'): Promise<RefIndex> {
  const rows = await pageAll<RefRow>((from, to) => client.from(table).select('id, code, name_ar, name_en').order('id').range(from, to));
  return indexRefs(rows);
}

function todayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
}

export type LoadContextOptions = {
  can?: Partial<ValidationContext['can']>;
  leaveYear?: number;
};

/** Loads what validation needs for an import type (only the tables that type uses). */
export async function loadValidationContext(client: DbClient, type: ImportType, options: LoadContextOptions = {}): Promise<ValidationContext> {
  const empty: RefIndex = indexRefs([]);
  const needsEmployees = true;
  const needsOrg = type === 'employees' || type === 'departments';
  const [employees, departments, jobTitles, locations, costCenters] = await Promise.all([
    needsEmployees ? loadEmployeeIndex(client) : Promise.resolve({ count: 0, byNumber: new Map(), byNationalId: new Map(), byName: new Map() } as EmployeeIndex),
    needsOrg ? loadRefs(client, 'departments') : Promise.resolve(empty),
    type === 'employees' || type === 'job_titles' ? loadRefs(client, 'job_titles') : Promise.resolve(empty),
    type === 'employees' || type === 'locations' ? loadRefs(client, 'locations') : Promise.resolve(empty),
    type === 'employees' || type === 'cost_centers' ? loadRefs(client, 'cost_centers') : Promise.resolve(empty),
  ]);

  let leaveTypes: ValidationContext['leaveTypes'] = { ...indexRefs([]), defaults: new Map() };
  const leaveBalances = new Map<string, string>();
  if (type === 'employees' || type === 'leave_balances') {
    const { data, error } = await client.from('leave_types').select('id, code, name_ar, name_en, default_entitlement').order('sort_order');
    if (error) throw error;
    const rows = (data ?? []) as Array<RefRow & { default_entitlement: number | string | null }>;
    leaveTypes = { ...indexRefs(rows), defaults: new Map(rows.map((r) => [r.id, Number(r.default_entitlement ?? 0)])) };
    const years = type === 'employees' ? [options.leaveYear ?? new Date().getFullYear()] : null;
    const balances = await pageAll<{ id: string; employee_id: string; leave_type_id: string; year: number }>((from, to) => {
      let q = client.from('leave_balances').select('id, employee_id, leave_type_id, year').order('id');
      if (years) q = q.in('year', years);
      return q.range(from, to);
    });
    for (const b of balances) leaveBalances.set(`${b.employee_id}:${b.leave_type_id}:${b.year}`, b.id);
  }

  const dependents: ValidationContext['dependents'] = new Map();
  if (type === 'dependents' || type === 'insurance') {
    const rows = await pageAll<{ id: string; employee_id: string; name_ar: string | null; name_en: string | null; national_id: string | null }>((from, to) =>
      client.from('employee_dependents').select('id, employee_id, name_ar, name_en, national_id').order('id').range(from, to),
    );
    for (const r of rows) {
      const list = dependents.get(r.employee_id) ?? [];
      list.push(r);
      dependents.set(r.employee_id, list);
    }
  }
  const insurance: ValidationContext['insurance'] = new Map();
  if (type === 'insurance') {
    const rows = await pageAll<{ id: string; employee_id: string; dependent_id: string | null; member_number: string | null; policy_number: string | null }>((from, to) =>
      client.from('employee_insurance').select('id, employee_id, dependent_id, member_number, policy_number').order('id').range(from, to),
    );
    for (const r of rows) {
      const list = insurance.get(r.employee_id) ?? [];
      list.push(r);
      insurance.set(r.employee_id, list);
    }
  }
  const documents: ValidationContext['documents'] = new Map();
  if (type === 'documents') {
    const rows = await pageAll<{ id: string; employee_id: string; document_type: string; document_number: string | null }>((from, to) =>
      client.from('employee_documents').select('id, employee_id, document_type, document_number').order('id').range(from, to),
    );
    for (const r of rows) {
      const list = documents.get(r.employee_id) ?? [];
      list.push(r);
      documents.set(r.employee_id, list);
    }
  }
  let holidays: ValidationContext['holidays'] = [];
  if (type === 'public_holidays') {
    const { data, error } = await client.from('public_holidays').select('id, name_ar, name_en, start_date').order('start_date');
    if (error) throw error;
    holidays = data ?? [];
  }

  return {
    type,
    today: todayIso(),
    employees,
    departments,
    jobTitles,
    locations,
    costCenters,
    leaveTypes,
    dependents,
    insurance,
    documents,
    holidays,
    leaveBalances,
    can: {
      leaveEdit: options.can?.leaveEdit ?? true,
      personalDataEdit: options.can?.personalDataEdit ?? true,
      settingsEdit: options.can?.settingsEdit ?? true,
    },
  };
}

/** Context without database data (pure file analysis: `pnpm analyze:workbook` without --db). */
export function emptyValidationContext(type: ImportType): ValidationContext {
  const empty = indexRefs([]);
  return {
    type,
    today: todayIso(),
    employees: { count: 0, byNumber: new Map(), byNationalId: new Map(), byName: new Map() },
    departments: empty,
    jobTitles: empty,
    locations: empty,
    costCenters: empty,
    leaveTypes: { ...indexRefs([{ id: 'annual', code: 'annual', name_ar: null, name_en: null }]), defaults: new Map() },
    dependents: new Map(),
    insurance: new Map(),
    documents: new Map(),
    holidays: [],
    leaveBalances: new Map(),
    can: { leaveEdit: true, personalDataEdit: true, settingsEdit: true },
  };
}
