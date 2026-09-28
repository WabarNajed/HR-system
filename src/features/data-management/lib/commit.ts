/**
 * Writes validated import rows. Shared by the app (user's RLS client — the database enforces the
 * actor's permissions and audits every row change) and the CLI (service role). Rows are written
 * in bulk with client-generated ids; when a bulk write fails the batch is retried row by row so
 * one bad row never blocks the others.
 */
import { mapError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import { findRef, indexRefs, type DbClient, type RefIndex, type RefRow } from './context';
import { matchKey } from './normalize';
import type { ImportOptions, ImportType, Issue, RowStatus } from './types';
import type { MappedRow, RefResolution } from './validate';

export type CommitRow = { id: string; row_number: number; mapped: MappedRow };

export type CommitOutcome = {
  rowId: string;
  rowNumber: number;
  status: Extract<RowStatus, 'imported' | 'skipped' | 'error'>;
  entityId: string | null;
  /** Created vs updated (imported rows). */
  operation?: 'create' | 'update';
  issues: Issue[];
};

export type CommitEnv = {
  client: DbClient;
  /** `user`: RPCs with the signed-in user's permissions. `service`: CLI with the service role. */
  mode: 'user' | 'service';
  importId: string;
  type: ImportType;
  options: ImportOptions;
};

export type CommitStats = { created: number; updated: number; skipped: number; failed: number; masterCreated: Record<string, number> };

type MasterTable = 'departments' | 'job_titles' | 'locations' | 'cost_centers';
const REF_TABLE: Record<string, MasterTable> = { department: 'departments', job_title: 'job_titles', location: 'locations', cost_center: 'cost_centers' };
const REF_COLUMN: Record<string, string> = { department: 'department_id', job_title: 'job_title_id', location: 'location_id', cost_center: 'cost_center_id', manager: 'manager_id' };

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function writeError(error: unknown): Issue {
  return { level: 'error', code: 'writeFailed', params: { reason: mapError(error) } };
}

function pick(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (values[k] !== undefined && values[k] !== null && values[k] !== '') out[k] = values[k];
  return out;
}

async function pool<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/* ─── Master data creation (auto-create referenced departments / job titles …) ── */

/** Reads every row of a query in pages of 1,000 (PostgREST caps a response at `max_rows`). */
async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadIndex(client: DbClient, table: MasterTable): Promise<RefIndex> {
  const rows = await readAll<RefRow>((from, to) => client.from(table).select('id, code, name_ar, name_en').order('id').range(from, to));
  return indexRefs(rows);
}

/** Resolves `create` references: reuses rows created meanwhile, inserts the rest. */
async function ensureMasterData(client: DbClient, rows: readonly CommitRow[], counters: Record<string, number>): Promise<Map<string, string>> {
  const resolved = new Map<string, string>(); // `${field}:${key}` → id
  const wanted = new Map<string, Map<string, { name: string; lang: 'ar' | 'en' }>>();
  for (const row of rows) {
    for (const [field, ref] of Object.entries(row.mapped.refs ?? {})) {
      if (ref.kind !== 'create' || !REF_TABLE[field]) continue;
      const m = wanted.get(field) ?? new Map();
      m.set(ref.key, { name: ref.name, lang: ref.lang });
      wanted.set(field, m);
    }
  }
  for (const [field, items] of wanted) {
    const table = REF_TABLE[field]!;
    const index = await loadIndex(client, table);
    for (const [key, item] of items) {
      const hit = findRef(index, item.name);
      if (hit) {
        resolved.set(`${field}:${key}`, hit.id);
        continue;
      }
      const id = uuid();
      const payload = { id, [item.lang === 'ar' ? 'name_ar' : 'name_en']: item.name, is_active: true };
      const { error } = await client.from(table).insert(payload as never);
      if (error) {
        // A concurrent import may have created it: re-read once.
        const again = findRef(await loadIndex(client, table), item.name);
        if (again) resolved.set(`${field}:${key}`, again.id);
        continue;
      }
      counters[table] = (counters[table] ?? 0) + 1;
      resolved.set(`${field}:${key}`, id);
    }
  }
  return resolved;
}

function refId(field: string, ref: RefResolution | undefined, created: Map<string, string>): string | null | undefined {
  if (!ref) return undefined;
  if (ref.kind === 'id') return ref.id;
  if (ref.kind === 'create') return created.get(`${field}:${ref.key}`) ?? null;
  return undefined; // in-file references are linked in `finalizeImport`
}

/* ─── Bulk insert with per-row fallback ───────────────────────────────────── */

type Insertable = 'employees' | 'departments' | 'job_titles' | 'locations' | 'cost_centers' | 'employee_dependents' | 'employee_insurance' | 'employee_documents' | 'public_holidays';

async function insertMany(
  client: DbClient,
  table: Insertable,
  items: Array<{ row: CommitRow; payload: Record<string, unknown> }>,
): Promise<Map<string, { ok: true } | { ok: false; issue: Issue }>> {
  const result = new Map<string, { ok: true } | { ok: false; issue: Issue }>();
  if (!items.length) return result;
  const { error } = await client.from(table).insert(items.map((i) => i.payload) as never);
  if (!error) {
    for (const i of items) result.set(i.row.id, { ok: true });
    return result;
  }
  await pool(items, 6, async (i) => {
    const { error: e } = await client.from(table).insert(i.payload as never);
    result.set(i.row.id, e ? { ok: false, issue: writeError(e) } : { ok: true });
  });
  return result;
}

async function updateOne(client: DbClient, table: Insertable, id: string, payload: Record<string, unknown>): Promise<Issue | null> {
  if (!Object.keys(payload).length) return null;
  const { error } = await client.from(table).update(payload as never).eq('id', id);
  return error ? writeError(error) : null;
}

/* ─── Employees ───────────────────────────────────────────────────────────── */

const EMPLOYEE_COLUMNS = [
  'employee_number', 'name_ar', 'name_en', 'national_id', 'id_type', 'gender', 'nationality', 'date_of_birth', 'marital_status',
  'company_email', 'personal_email', 'mobile', 'alt_mobile', 'address', 'division', 'section', 'iqama_profession', 'grade',
  'employment_type', 'employment_status', 'joining_date', 'probation_end_date', 'contract_start_date', 'contract_end_date',
  'iqama_issue_date', 'iqama_expiry_date', 'iqama_expiry_hijri', 'passport_number', 'passport_expiry_date', 'employer_number',
  'is_outside_kingdom', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_mobile',
] as const;

async function annualLeaveType(client: DbClient): Promise<{ id: string; entitlement: number } | null> {
  const { data } = await client.from('leave_types').select('id, default_entitlement').eq('code', 'annual').maybeSingle();
  return data ? { id: data.id, entitlement: Number(data.default_entitlement ?? 0) } : null;
}

async function setLeaveBalance(
  env: CommitEnv,
  employeeId: string,
  leaveTypeId: string,
  year: number,
  opening: number,
  entitlement: number | null,
  defaultEntitlement: number,
): Promise<Issue | null> {
  if (env.mode === 'user') {
    const { error } = await env.client.rpc('set_leave_balance', {
      p_employee_id: employeeId,
      p_leave_type_id: leaveTypeId,
      p_year: year,
      p_opening_balance: opening,
      p_entitlement: entitlement ?? undefined,
    });
    return error ? writeError(error) : null;
  }
  // Service role (CLI): direct upsert — the RPC requires a signed-in HR user.
  const { data: existing } = await env.client
    .from('leave_balances')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('leave_type_id', leaveTypeId)
    .eq('year', year)
    .maybeSingle();
  const payload: TablesInsert<'leave_balances'> = {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    year,
    opening_balance: opening,
    entitlement: entitlement ?? (existing ? undefined : defaultEntitlement),
  };
  const { error } = existing
    ? await env.client.from('leave_balances').update({ opening_balance: opening, ...(entitlement !== null ? { entitlement } : {}) }).eq('id', existing.id)
    : await env.client.from('leave_balances').insert(payload);
  return error ? writeError(error) : null;
}

async function commitEmployees(env: CommitEnv, rows: CommitRow[], counters: Record<string, number>): Promise<CommitOutcome[]> {
  const created = await ensureMasterData(env.client, rows, counters);
  const annual = rows.some((r) => typeof r.mapped.values.leave_balance === 'number') ? await annualLeaveType(env.client) : null;
  const outcomes = new Map<string, CommitOutcome>();

  const payloadFor = (row: CommitRow, forUpdate: boolean): Record<string, unknown> => {
    const values = row.mapped.values ?? {};
    const payload = pick(values, EMPLOYEE_COLUMNS);
    for (const field of ['department', 'job_title', 'location', 'cost_center', 'manager']) {
      const id = refId(field, row.mapped.refs?.[field], created);
      if (id) payload[REF_COLUMN[field]!] = id;
    }
    if (!forUpdate) {
      payload.extra_data = row.mapped.extra ?? {};
      payload.import_id = env.importId;
    }
    return payload;
  };

  // Creates.
  const creates = rows.filter((r) => r.mapped.action === 'create');
  const createItems = creates.map((row) => ({ row, id: uuid(), payload: {} as Record<string, unknown> }));
  for (const item of createItems) item.payload = { id: item.id, ...payloadFor(item.row, false) };
  const inserted = await insertMany(env.client, 'employees', createItems);
  for (const item of createItems) {
    const res = inserted.get(item.row.id);
    outcomes.set(item.row.id, res?.ok
      ? { rowId: item.row.id, rowNumber: item.row.row_number, status: 'imported', entityId: item.id, operation: 'create', issues: [] }
      : { rowId: item.row.id, rowNumber: item.row.row_number, status: 'error', entityId: null, issues: [res && !res.ok ? res.issue : writeError(null)] });
  }

  // Updates (extra_data merged with what is already stored).
  const updates = rows.filter((r) => r.mapped.action === 'update' && r.mapped.match);
  const extraById = new Map<string, Record<string, unknown>>();
  if (updates.length) {
    const ids = updates.map((r) => r.mapped.match!.id);
    const { data } = await env.client.from('employee_records').select('id, extra_data').in('id', ids);
    for (const e of data ?? []) if (e.id) extraById.set(e.id, (e.extra_data as Record<string, unknown>) ?? {});
  }
  await pool(updates, 6, async (row) => {
    const id = row.mapped.match!.id;
    const payload = payloadFor(row, true);
    const extra = row.mapped.extra ?? {};
    if (Object.keys(extra).length) payload.extra_data = { ...(extraById.get(id) ?? {}), ...extra };
    const issue = await updateOne(env.client, 'employees', id, payload);
    outcomes.set(row.id, issue
      ? { rowId: row.id, rowNumber: row.row_number, status: 'error', entityId: id, issues: [issue] }
      : { rowId: row.id, rowNumber: row.row_number, status: 'imported', entityId: id, operation: 'update', issues: [] });
  });

  // Skips.
  for (const row of rows) {
    if (!outcomes.has(row.id)) outcomes.set(row.id, { rowId: row.id, rowNumber: row.row_number, status: 'skipped', entityId: row.mapped.match?.id ?? null, issues: [] });
  }

  // Leave balances for imported rows.
  if (annual) {
    const year = env.options.leaveYear;
    const entitlement = env.options.leaveBalanceMode === 'available' ? 0 : null;
    await pool(
      Array.from(outcomes.values()).filter((o) => o.status === 'imported' && o.entityId),
      6,
      async (o) => {
        const row = rows.find((r) => r.id === o.rowId)!;
        const value = row.mapped.values.leave_balance;
        if (typeof value !== 'number') return;
        const issue = await setLeaveBalance(env, o.entityId!, annual.id, year, value, entitlement, annual.entitlement);
        if (issue) o.issues.push({ ...issue, level: 'warning', code: 'leaveBalanceFailed' });
      },
    );
  }
  return rows.map((r) => outcomes.get(r.id)!);
}

/* ─── Other entities ──────────────────────────────────────────────────────── */

const ENTITY_TABLE: Partial<Record<ImportType, Insertable>> = {
  departments: 'departments',
  job_titles: 'job_titles',
  locations: 'locations',
  cost_centers: 'cost_centers',
  dependents: 'employee_dependents',
  insurance: 'employee_insurance',
  documents: 'employee_documents',
  public_holidays: 'public_holidays',
};

const ENTITY_COLUMNS: Partial<Record<ImportType, readonly string[]>> = {
  departments: ['code', 'name_ar', 'name_en', 'is_active'],
  job_titles: ['code', 'name_ar', 'name_en', 'is_active'],
  locations: ['code', 'name_ar', 'name_en', 'city', 'country', 'is_active'],
  cost_centers: ['code', 'name_ar', 'name_en', 'is_active'],
  dependents: ['name_ar', 'name_en', 'relationship', 'date_of_birth', 'nationality', 'national_id', 'iqama_expiry_date', 'passport_number', 'passport_expiry_date', 'insurance_status', 'insurance_member_number', 'notes'],
  insurance: ['provider', 'policy_number', 'class', 'member_number', 'start_date', 'expiry_date', 'status'],
  documents: ['document_type', 'document_number', 'issue_date', 'expiry_date', 'status', 'notes'],
  public_holidays: ['name_ar', 'name_en', 'start_date', 'end_date', 'is_active'],
};

async function commitGeneric(env: CommitEnv, rows: CommitRow[]): Promise<CommitOutcome[]> {
  const table = ENTITY_TABLE[env.type]!;
  const columns = ENTITY_COLUMNS[env.type]!;
  const payloadFor = (row: CommitRow): Record<string, unknown> => {
    const p = pick(row.mapped.values ?? {}, columns);
    const refs = row.mapped.refs ?? {};
    if (env.type === 'departments') {
      if (refs.parent?.kind === 'id') p.parent_id = refs.parent.id;
      if (refs.head?.kind === 'id') p.head_employee_id = refs.head.id;
    }
    if (env.type === 'insurance' && refs.dependent_name?.kind === 'id') p.dependent_id = refs.dependent_name.id;
    if (row.mapped.employee && ['dependents', 'insurance', 'documents'].includes(env.type)) p.employee_id = row.mapped.employee.id;
    return p;
  };
  const outcomes = new Map<string, CommitOutcome>();
  const creates = rows.filter((r) => r.mapped.action === 'create').map((row) => ({ row, id: uuid(), payload: {} as Record<string, unknown> }));
  for (const c of creates) c.payload = { id: c.id, ...payloadFor(c.row) };
  const inserted = await insertMany(env.client, table, creates);
  for (const c of creates) {
    const res = inserted.get(c.row.id);
    outcomes.set(c.row.id, res?.ok
      ? { rowId: c.row.id, rowNumber: c.row.row_number, status: 'imported', entityId: c.id, operation: 'create', issues: [] }
      : { rowId: c.row.id, rowNumber: c.row.row_number, status: 'error', entityId: null, issues: [res && !res.ok ? res.issue : writeError(null)] });
  }
  await pool(rows.filter((r) => r.mapped.action === 'update' && r.mapped.match), 6, async (row) => {
    const payload = payloadFor(row);
    delete payload.employee_id;
    const issue = await updateOne(env.client, table, row.mapped.match!.id, payload);
    outcomes.set(row.id, issue
      ? { rowId: row.id, rowNumber: row.row_number, status: 'error', entityId: row.mapped.match!.id, issues: [issue] }
      : { rowId: row.id, rowNumber: row.row_number, status: 'imported', entityId: row.mapped.match!.id, operation: 'update', issues: [] });
  });
  return rows.map((r) => outcomes.get(r.id) ?? { rowId: r.id, rowNumber: r.row_number, status: 'skipped', entityId: r.mapped.match?.id ?? null, issues: [] });
}

async function commitLeaveBalances(env: CommitEnv, rows: CommitRow[]): Promise<CommitOutcome[]> {
  const { data: types } = await env.client.from('leave_types').select('id, default_entitlement');
  const defaults = new Map((types ?? []).map((t) => [t.id, Number(t.default_entitlement ?? 0)]));
  return pool(rows, 6, async (row): Promise<CommitOutcome> => {
    const base = { rowId: row.id, rowNumber: row.row_number };
    if (row.mapped.action === 'skip' || !row.mapped.employee) return { ...base, status: 'skipped', entityId: row.mapped.match?.id ?? null, issues: [] };
    const lt = row.mapped.refs?.leave_type;
    const v = row.mapped.values;
    if (lt?.kind !== 'id' || typeof v.opening_balance !== 'number' || typeof v.year !== 'number') {
      return { ...base, status: 'error', entityId: null, issues: [writeError(null)] };
    }
    const entitlement = typeof v.entitlement === 'number' ? v.entitlement : null;
    const issue = await setLeaveBalance(env, row.mapped.employee.id, lt.id, v.year, v.opening_balance, entitlement, defaults.get(lt.id) ?? 0);
    return issue
      ? { ...base, status: 'error', entityId: null, issues: [issue] }
      : { ...base, status: 'imported', entityId: row.mapped.match?.id ?? null, operation: row.mapped.action === 'update' ? 'update' : 'create', issues: [] };
  });
}

/** Writes one batch of validated rows (status valid/warning). */
export async function commitRows(env: CommitEnv, rows: CommitRow[], counters: Record<string, number> = {}): Promise<CommitOutcome[]> {
  if (!rows.length) return [];
  switch (env.type) {
    case 'employees':
      return commitEmployees(env, rows, counters);
    case 'leave_balances':
      return commitLeaveBalances(env, rows);
    default:
      return commitGeneric(env, rows);
  }
}

/* ─── Final pass: in-file references (managers, parent departments) ──────── */

export type FinalizeRow = { entity_id: string | null; mapped: MappedRow };

export async function finalizeReferences(env: CommitEnv, rows: readonly FinalizeRow[]): Promise<{ linked: number; unresolved: number }> {
  let linked = 0;
  let unresolved = 0;
  if (env.type === 'employees') {
    const pending = rows.filter((r) => r.entity_id && r.mapped.refs?.manager?.kind === 'file');
    if (!pending.length) return { linked, unresolved };
    // Every employee written by this import (paged: PostgREST returns at most 1,000 rows per request).
    const list = await readAll<{ id: string; employee_number: string | null; national_id: string | null; name_ar: string | null; name_en: string | null }>(
      (from, to) =>
        env.client
          .from('employee_records')
          .select('id, employee_number, national_id, name_ar, name_en')
          .eq('import_id', env.importId)
          .order('id')
          .range(from, to)
          .overrideTypes<{ id: string; employee_number: string | null; national_id: string | null; name_ar: string | null; name_en: string | null }[], { merge: false }>(),
    );
    const numberKey = (v: string) => v.replace(/\s+/g, '').toUpperCase();
    const byNumber = new Map<string, string>();
    const byNationalId = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const e of list) {
      if (e.employee_number && !byNumber.has(numberKey(e.employee_number))) byNumber.set(numberKey(e.employee_number), e.id);
      if (e.national_id && !byNationalId.has(e.national_id)) byNationalId.set(e.national_id, e.id);
      for (const n of [e.name_ar, e.name_en]) if (n && !byName.has(matchKey(n))) byName.set(matchKey(n), e.id);
    }
    await pool(pending, 6, async (r) => {
      const ref = r.mapped.refs.manager as Extract<RefResolution, { kind: 'file' }>;
      const hitId =
        (ref.number ? byNumber.get(numberKey(ref.number)) : undefined) ??
        (ref.nationalId ? byNationalId.get(ref.nationalId) : undefined) ??
        (ref.name ? byName.get(matchKey(ref.name)) : undefined);
      const hit = hitId ? { id: hitId } : null;
      if (!hit || hit.id === r.entity_id) {
        unresolved++;
        return;
      }
      const { error } = await env.client.from('employees').update({ manager_id: hit.id }).eq('id', r.entity_id!);
      if (error) unresolved++;
      else linked++;
    });
  }
  if (env.type === 'departments') {
    const pending = rows.filter((r) => r.entity_id && r.mapped.refs?.parent?.kind === 'file');
    if (!pending.length) return { linked, unresolved };
    const index = await loadIndex(env.client, 'departments');
    await pool(pending, 6, async (r) => {
      const ref = r.mapped.refs.parent as Extract<RefResolution, { kind: 'file' }>;
      const hit = ref.name ? findRef(index, ref.name) : null;
      if (!hit || hit.id === r.entity_id) {
        unresolved++;
        return;
      }
      const { error } = await env.client.from('departments').update({ parent_id: hit.id }).eq('id', r.entity_id!);
      if (error) unresolved++;
      else linked++;
    });
  }
  return { linked, unresolved };
}

export function emptyStats(): CommitStats {
  return { created: 0, updated: 0, skipped: 0, failed: 0, masterCreated: {} };
}

export function addOutcomes(stats: CommitStats, outcomes: readonly CommitOutcome[]): CommitStats {
  for (const o of outcomes) {
    if (o.status === 'imported') {
      if (o.operation === 'update') stats.updated++;
      else stats.created++;
    } else if (o.status === 'skipped') stats.skipped++;
    else stats.failed++;
  }
  return stats;
}
