#!/usr/bin/env node
/**
 * LOCAL-ONLY QA fixtures for the HR Portal.
 *
 *   node scripts/dev/seed-local-fixtures.mjs [--verify]
 *
 * Creates (idempotently) QA users through the GoTrue admin API, QA master data, QA employees linked to
 * those users, compensation, bank accounts and leave balances — so every role can be exercised in the
 * browser. Refuses to run unless the Supabase URL points at localhost / 127.0.0.1.
 *
 * Reads /home/user/HR-system/.env.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY). Password: LOCAL_FIXTURE_PASSWORD (default "Passw0rd!Local").
 * --verify signs in as every fixture user and prints how many employee rows RLS lets them read.
 *
 * Never run this against a hosted project: it is QA data, not product data.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------------------------------
function loadEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const fileEnv = loadEnvFile(resolve(ROOT, '.env.local'));
const env = { ...fileEnv, ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = env.LOCAL_FIXTURE_PASSWORD || 'Passw0rd!Local';
const VERIFY = process.argv.includes('--verify');

function fail(message) {
  console.error(`seed-local-fixtures: ${message}`);
  process.exit(1);
}

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  fail('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).');
}
let host;
try {
  host = new URL(SUPABASE_URL).hostname;
} catch {
  fail(`invalid Supabase URL: ${SUPABASE_URL}`);
}
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  fail(`refusing to run: ${SUPABASE_URL} is not a local Supabase instance (localhost / 127.0.0.1 only).`);
}

// ---------------------------------------------------------------------------------------------------
// HTTP helpers (service role)
// ---------------------------------------------------------------------------------------------------
async function http(method, path, { body, token = SERVICE_KEY, apikey = SERVICE_KEY, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { data, headers: res.headers };
}

const rest = {
  get: (table, query) => http('GET', `/rest/v1/${table}?${query}`).then((r) => r.data),
  upsert: (table, rows, onConflict) =>
    http('POST', `/rest/v1/${table}?on_conflict=${onConflict}`, {
      body: rows,
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    }).then((r) => r.data),
  insert: (table, rows) =>
    http('POST', `/rest/v1/${table}`, { body: rows, headers: { Prefer: 'return=representation' } }).then((r) => r.data),
  patch: (table, query, body) =>
    http('PATCH', `/rest/v1/${table}?${query}`, { body, headers: { Prefer: 'return=representation' } }).then((r) => r.data),
  delete: (table, query) => http('DELETE', `/rest/v1/${table}?${query}`),
};

// ---------------------------------------------------------------------------------------------------
// Fixture definitions
// ---------------------------------------------------------------------------------------------------
const today = new Date();
const isoDate = (offsetDays) => {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offsetDays));
  return d.toISOString().slice(0, 10);
};
const YEAR = today.getUTCFullYear();

const DEPARTMENTS = [
  { code: 'QA-HR', name_ar: 'QA الموارد البشرية', name_en: 'QA Human Resources' },
  { code: 'QA-OPS', name_ar: 'QA العمليات', name_en: 'QA Operations' },
];
const JOB_TITLES = [
  { code: 'QA-HRM', name_ar: 'QA مدير الموارد البشرية', name_en: 'QA HR Manager' },
  { code: 'QA-HRS', name_ar: 'QA أخصائي موارد بشرية', name_en: 'QA HR Specialist' },
  { code: 'QA-OPM', name_ar: 'QA مدير العمليات', name_en: 'QA Operations Manager' },
  { code: 'QA-OPS', name_ar: 'QA أخصائي عمليات', name_en: 'QA Operations Specialist' },
];
const LOCATIONS = [{ code: 'QA-RUH', name_ar: 'QA المقر الرئيسي', name_en: 'QA Head Office', city: 'Riyadh', country: 'SA' }];
const COST_CENTERS = [{ code: 'QA-CC-100', name_ar: 'QA مركز التكلفة العام', name_en: 'QA General Cost Center' }];

// iqama / passport / contract offsets spread across the expiry buckets (expired, 7, 14, 30, 60, 90, valid)
const EMPLOYEES = [
  { number: 'QA-0001', name_ar: 'QA مدير الموارد البشرية', name_en: 'QA HR Admin', gender: 'male', dept: 'QA-HR', job: 'QA-HRM',
    manager: null, iqama: 200, passport: 5, contract: 400, salary: 18000 },
  { number: 'QA-0002', name_ar: 'QA أخصائية الموارد البشرية', name_en: 'QA HR Officer', gender: 'female', dept: 'QA-HR', job: 'QA-HRS',
    manager: 'QA-0001', iqama: 80, passport: 365, contract: null, salary: 11000 },
  { number: 'QA-0003', name_ar: 'QA مدير العمليات', name_en: 'QA Operations Manager', gender: 'male', dept: 'QA-OPS', job: 'QA-OPM',
    manager: null, iqama: 45, passport: 55, contract: 85, salary: 16000 },
  { number: 'QA-0004', name_ar: 'QA موظف العمليات الأول', name_en: 'QA Employee One', gender: 'male', dept: 'QA-OPS', job: 'QA-OPS',
    manager: 'QA-0003', iqama: 20, passport: -30, contract: 12, salary: 8000 },
  { number: 'QA-0005', name_ar: 'QA موظفة العمليات الثانية', name_en: 'QA Employee Two', gender: 'female', dept: 'QA-OPS', job: 'QA-OPS',
    manager: 'QA-0003', iqama: 10, passport: 120, contract: 300, salary: 8500 },
  { number: 'QA-0006', name_ar: 'QA موظف بانتظار التسجيل', name_en: 'QA Pending Registrant', gender: 'male', dept: 'QA-HR', job: 'QA-HRS',
    manager: 'QA-0001', iqama: -5, passport: 25, contract: null, salary: 7000 },
];

// status: active users are created as admin-provisioned (app_metadata.invited_by_admin); pending@ signs
// up like a real applicant (registration employee number QA-0006 → matched suggestion).
const USERS = [
  { email: 'superadmin@hr.local', name: 'QA Super Admin', roles: ['super_admin'], status: 'active', employee: null },
  { email: 'hradmin@hr.local', name: 'QA HR Admin', roles: ['hr_admin', 'employee'], status: 'active', employee: 'QA-0001' },
  { email: 'hrofficer@hr.local', name: 'QA HR Officer', roles: ['hr_officer', 'employee'], status: 'active', employee: 'QA-0002' },
  { email: 'manager@hr.local', name: 'QA Operations Manager', roles: ['manager', 'employee'], status: 'active', employee: 'QA-0003' },
  { email: 'employee@hr.local', name: 'QA Employee One', roles: ['employee'], status: 'active', employee: 'QA-0004' },
  { email: 'employee2@hr.local', name: 'QA Employee Two', roles: ['employee'], status: 'active', employee: 'QA-0005' },
  { email: 'pending@hr.local', name: 'QA Pending Registrant', roles: [], status: 'pending', employee: null, registration: 'QA-0006' },
  { email: 'disabled@hr.local', name: 'QA Disabled User', roles: ['employee'], status: 'disabled', employee: null },
];

// ---------------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------------
async function listAuthUsers() {
  const users = [];
  for (let page = 1; page < 50; page++) {
    const { data } = await http('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

async function ensureAuthUser(u, existing) {
  const found = existing.find((x) => (x.email || '').toLowerCase() === u.email);
  if (found) {
    await http('PUT', `/auth/v1/admin/users/${found.id}`, { body: { password: PASSWORD, email_confirm: true } });
    return { id: found.id, created: false };
  }
  const invited = u.status !== 'pending';
  const { data } = await http('POST', '/auth/v1/admin/users', {
    body: {
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.name, ...(u.registration ? { employee_number: u.registration } : {}) },
      ...(invited ? { app_metadata: { invited_by_admin: true } } : {}),
    },
  });
  return { id: data.id, created: true };
}

async function upsertMasterData() {
  const depts = await rest.upsert('departments', DEPARTMENTS.map((d) => ({ ...d, is_active: true })), 'code');
  const jobs = await rest.upsert('job_titles', JOB_TITLES.map((j) => ({ ...j, is_active: true })), 'code');
  const locs = await rest.upsert('locations', LOCATIONS.map((l) => ({ ...l, is_active: true })), 'code');
  const ccs = await rest.upsert('cost_centers', COST_CENTERS.map((c) => ({ ...c, is_active: true })), 'code');
  const byCode = (rows) => Object.fromEntries(rows.map((r) => [r.code, r.id]));
  return { depts: byCode(depts), jobs: byCode(jobs), location: locs[0].id, costCenter: ccs[0].id };
}

async function upsertEmployees(master) {
  // first pass without managers, second pass sets manager_id (self references)
  const base = EMPLOYEES.map((e) => ({
    employee_number: e.number,
    name_ar: e.name_ar,
    name_en: e.name_en,
    company_email: `${e.number.toLowerCase()}@qa.hr.local`,
    mobile: `05000000${e.number.slice(-2)}`,
    gender: e.gender,
    nationality: e.number === 'QA-0003' ? 'Saudi' : 'Non-Saudi',
    marital_status: 'single',
    department_id: master.depts[e.dept],
    job_title_id: master.jobs[e.job],
    location_id: master.location,
    cost_center_id: master.costCenter,
    employment_type: 'full_time',
    employment_status: 'active',
    joining_date: isoDate(-700 - Number(e.number.slice(-1)) * 30),
    contract_start_date: isoDate(-700),
    contract_end_date: e.contract === null ? null : isoDate(e.contract),
    national_id: `QA${e.number.slice(-4)}000${e.number.slice(-1)}`,
    id_type: e.number === 'QA-0003' ? 'national_id' : 'iqama',
    iqama_expiry_date: isoDate(e.iqama),
    passport_number: `QAP${e.number.slice(-4)}`,
    passport_expiry_date: isoDate(e.passport),
  }));
  const rows = await rest.upsert('employees', base, 'employee_number');
  const idByNumber = Object.fromEntries(rows.map((r) => [r.employee_number, r.id]));
  for (const e of EMPLOYEES) {
    await rest.patch('employees', `id=eq.${idByNumber[e.number]}`, { manager_id: e.manager ? idByNumber[e.manager] : null });
  }
  await rest.upsert(
    'employee_compensation',
    EMPLOYEES.map((e) => ({
      employee_id: idByNumber[e.number],
      basic_salary: e.salary,
      housing_allowance: Math.round(e.salary * 0.25),
      transport_allowance: Math.round(e.salary * 0.1),
      other_allowance: 0,
      currency: 'SAR',
      effective_date: isoDate(-365),
    })),
    'employee_id',
  );
  for (const e of EMPLOYEES) {
    const employeeId = idByNumber[e.number];
    const iban = `SA03800000006080101675${e.number.slice(-2)}`;
    const existing = await rest.get('employee_bank_accounts', `employee_id=eq.${employeeId}&is_primary=eq.true&select=id`);
    if (existing.length) {
      await rest.patch('employee_bank_accounts', `id=eq.${existing[0].id}`, { bank_name: 'QA Bank', iban, account_holder: e.name_en });
    } else {
      await rest.insert('employee_bank_accounts', [{ employee_id: employeeId, bank_name: 'QA Bank', iban, account_holder: e.name_en, is_primary: true }]);
    }
  }
  return idByNumber;
}

async function upsertLeaveBalances(idByNumber) {
  const types = await rest.get('leave_types', 'select=id,code,default_entitlement,gender_restriction&is_active=eq.true&deducts_balance=eq.true');
  const rows = [];
  for (const e of EMPLOYEES) {
    for (const t of types) {
      if (t.gender_restriction && t.gender_restriction !== e.gender) continue;
      rows.push({ employee_id: idByNumber[e.number], leave_type_id: t.id, year: YEAR, opening_balance: 0, entitlement: t.default_entitlement });
    }
  }
  if (rows.length) await rest.upsert('leave_balances', rows, 'employee_id,leave_type_id,year');
  return rows.length;
}

async function syncProfilesAndRoles(userIds, idByNumber) {
  const roles = await rest.get('roles', 'select=id,key');
  const roleId = Object.fromEntries(roles.map((r) => [r.key, r.id]));
  for (const u of USERS) {
    const id = userIds[u.email];
    const employeeId = u.employee ? idByNumber[u.employee] : null;
    if (employeeId) {
      // release the employee from any other profile first (unique link)
      await rest.patch('profiles', `employee_id=eq.${employeeId}&id=neq.${id}`, { employee_id: null });
    }
    const wanted = u.roles.map((k) => roleId[k]);
    if (wanted.length) {
      await rest.upsert('user_roles', wanted.map((r) => ({ user_id: id, role_id: r })), 'user_id,role_id');
    }
    const current = await rest.get('user_roles', `user_id=eq.${id}&select=id,role_id`);
    const extra = current.filter((r) => !wanted.includes(r.role_id));
    if (extra.length) await rest.delete('user_roles', `id=in.(${extra.map((r) => r.id).join(',')})`);
    const patch = { full_name: u.name, employee_id: employeeId, status: u.status };
    if (u.status === 'pending') {
      patch.registration_employee_number = u.registration;
      patch.matched_employee_id = idByNumber[u.registration] ?? null;
    }
    await rest.patch('profiles', `id=eq.${id}`, patch);
  }
}

async function verify() {
  console.log('\nVerification (sign in through the gateway, then read employees with RLS):');
  const rows = [];
  for (const u of USERS) {
    try {
      const { data } = await http('POST', '/auth/v1/token?grant_type=password', {
        body: { email: u.email, password: PASSWORD },
        token: ANON_KEY,
        apikey: ANON_KEY,
      });
      const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=id`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${data.access_token}`, Prefer: 'count=exact' },
      });
      const range = res.headers.get('content-range') || '';
      rows.push({ email: u.email, signIn: 'ok', employeesVisible: range.split('/')[1] ?? '?' });
    } catch (err) {
      rows.push({ email: u.email, signIn: `failed (${err.status ?? err.message})`, employeesVisible: '-' });
    }
  }
  console.table(rows);
}

// ---------------------------------------------------------------------------------------------------
async function main() {
  console.log(`Seeding LOCAL QA fixtures into ${SUPABASE_URL} …`);
  const existing = await listAuthUsers();
  const master = await upsertMasterData();
  const idByNumber = await upsertEmployees(master);
  const balances = await upsertLeaveBalances(idByNumber);

  const userIds = {};
  for (const u of USERS) {
    const { id, created } = await ensureAuthUser(u, existing);
    userIds[u.email] = id;
    if (created) console.log(`  created auth user ${u.email}`);
  }
  await syncProfilesAndRoles(userIds, idByNumber);

  console.log(`  master data: ${DEPARTMENTS.length} departments, ${JOB_TITLES.length} job titles, ${LOCATIONS.length} location, ${COST_CENTERS.length} cost center`);
  console.log(`  employees: ${EMPLOYEES.length} (QA-0001…QA-000${EMPLOYEES.length}), leave balances for ${YEAR}: ${balances}`);
  console.log('\nLocal QA credentials (password for all: ' + PASSWORD + '):');
  console.table(
    USERS.map((u) => ({
      email: u.email,
      roles: u.roles.join(', ') || '—',
      status: u.status,
      employee: u.employee ?? (u.registration ? `registration → ${u.registration}` : '—'),
    })),
  );
  if (VERIFY) await verify();
}

main().catch((err) => {
  console.error(`seed-local-fixtures: ${err.message}`);
  process.exit(1);
});
