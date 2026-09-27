import 'server-only';

import { cache } from 'react';
import { getSessionContext, type SessionContext } from '@/lib/auth/session';
import { addDays, todayIso } from '@/lib/dates';
import { localized } from '@/lib/i18n/localized';
import type { Locale } from '@/lib/i18n/config';
import { toIlikePattern, type ListParams } from '@/lib/list-params';
import { ALL_PERMISSIONS, isPermission, type Permission } from '@/lib/permissions';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import { maskTail } from '@/lib/format';
import { normalizeSearch, sanitizeFilter, type DirectoryFilterKey, type DirectorySort } from './directory-params';
import type {
  BankRecord,
  CompensationRecord,
  DependentRecord,
  DirectoryRow,
  DirectoryStats,
  EmployeeRecord,
  InsuranceRecord,
  ManagerCard,
  MasterDataOptions,
  NamedRef,
  Option,
} from './types';

/* ─── Viewer: org-scoped permissions ──────────────────────────────────────── */

/**
 * RLS grants org-wide rows only through roles with `data_scope = 'organization'`
 * (`private.has_org_permission`). The session merges permissions of all roles, so e.g. an HR officer
 * who is also an `employee` holds `requests.create` only for themselves. This mirrors the DB rule.
 */
export const getOrgPermissions = cache(async (): Promise<Set<Permission>> => {
  const ctx = await getSessionContext();
  if (!ctx) return new Set();
  if (ctx.isSuperAdmin) return new Set(ALL_PERMISSIONS);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('role:roles(data_scope, role_permissions(module, action))')
    .eq('user_id', ctx.user.id);
  if (error) {
    console.error('[employees] org permissions lookup failed:', error.code, error.message);
    return new Set();
  }
  const out = new Set<Permission>();
  type Row = { role: { data_scope: string | null; role_permissions: { module: string; action: string }[] | null } | null };
  for (const row of (data ?? []) as unknown as Row[]) {
    if (row.role?.data_scope !== 'organization') continue;
    for (const p of row.role.role_permissions ?? []) {
      const key = `${p.module}.${p.action}`;
      if (isPermission(key)) out.add(key);
    }
  }
  return out;
});

export type EmployeeViewer = {
  ctx: SessionContext;
  /** Org-scoped permission (what RLS grants across all employees). */
  orgCan: (permission: Permission) => boolean;
  /** Sees the whole organization's directory. */
  isOrgViewer: boolean;
  /** Linked employee id of the viewer (for self / team checks). */
  employeeId: string | null;
};

export async function getViewer(ctx: SessionContext): Promise<EmployeeViewer> {
  const org = await getOrgPermissions();
  const orgCan = (p: Permission) => ctx.isSuperAdmin || org.has(p);
  return { ctx, orgCan, isOrgViewer: orgCan('employees.view'), employeeId: ctx.employee?.id ?? ctx.profile.employeeId ?? null };
}

/* ─── Directory ───────────────────────────────────────────────────────────── */

const DIRECTORY_SELECT_BASE =
  'id, employee_number, name_ar, name_en, company_email, mobile, nationality, employment_status, employment_type, joining_date, avatar_path, archived_at, manager_id, ' +
  'department:departments!department_id(id, name_ar, name_en), job_title:job_titles!job_title_id(id, name_ar, name_en), ' +
  'location:locations!location_id(id, name_ar, name_en), manager:manager_id(id, name_ar, name_en, employee_number), ' +
  'portal:profiles!profiles_employee_id_fkey(id, status)';

/** Directory columns; government-ID data only for org viewers (managers get directory columns only). */
export function directorySelect(viewer: Pick<EmployeeViewer, 'isOrgViewer'>): string {
  return viewer.isOrgViewer ? `${DIRECTORY_SELECT_BASE}, iqama_expiry_date` : DIRECTORY_SELECT_BASE;
}

/** Accepts both the page's typed params and the export route's generic `ListParams`. */
type DirectoryParams = { q: string; filters: Partial<Record<string, string[]>>; sort: string | null; dir: 'asc' | 'desc' };

// The PostgREST builder's generics are column-typed; filters here are driven by a whitelist, so a
// loosely typed builder keeps this helper reusable for the list, counts and exports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any;

/**
 * Applies search + filters + scope to an `employees` query. Managers (non-org viewers) are scoped to
 * their direct reports; everything else is left to RLS.
 */
export function applyDirectoryFilters<Q extends AnyBuilder>(
  query: Q,
  params: DirectoryParams,
  viewer: Pick<EmployeeViewer, 'isOrgViewer' | 'orgCan' | 'employeeId'>,
  today: string = todayIso(),
): Q {
  let q: AnyBuilder = query;
  if (!viewer.isOrgViewer) {
    q = viewer.employeeId ? q.eq('manager_id', viewer.employeeId) : q.eq('id', '00000000-0000-0000-0000-000000000000');
  }

  const term = params.q.trim();
  if (term) {
    const norm = toIlikePattern(normalizeSearch(term));
    if (viewer.isOrgViewer && viewer.orgCan('personal_data.view')) {
      const raw = toIlikePattern(term);
      q = q.or(`search_norm.ilike.${norm},national_id.ilike.${raw},passport_number.ilike.${raw},personal_email.ilike.${raw}`);
    } else {
      q = q.ilike('search_norm', norm);
    }
  }

  const f = (key: DirectoryFilterKey) => sanitizeFilter(key, params.filters[key]);
  const department = f('department');
  if (department.length) q = q.in('department_id', department);
  const status = f('status');
  if (status.length) q = q.in('employment_status', status);
  const manager = f('manager');
  if (manager.length) q = q.in('manager_id', manager);
  const location = f('location');
  if (location.length) q = q.in('location_id', location);
  const nationality = f('nationality');
  if (nationality.length) q = q.in('nationality', nationality);
  const jobTitle = f('jobTitle');
  if (jobTitle.length) q = q.in('job_title_id', jobTitle);
  const employmentType = f('employmentType');
  if (employmentType.length) q = q.in('employment_type', employmentType);
  const gender = f('gender');
  if (gender.length) q = q.in('gender', gender);

  const [iqama] = viewer.isOrgViewer ? f('iqama') : [];
  if (iqama === 'expired') q = q.lt('iqama_expiry_date', today);
  else if (iqama === 'within30') q = q.gte('iqama_expiry_date', today).lte('iqama_expiry_date', addDays(today, 30));
  else if (iqama === 'within60') q = q.gte('iqama_expiry_date', today).lte('iqama_expiry_date', addDays(today, 60));
  else if (iqama === 'within90') q = q.gte('iqama_expiry_date', today).lte('iqama_expiry_date', addDays(today, 90));
  else if (iqama === 'valid') q = q.gt('iqama_expiry_date', addDays(today, 90));
  else if (iqama === 'missing') q = q.is('iqama_expiry_date', null);

  const [portal] = f('portal');
  if (portal === 'with') q = q.not('portal', 'is', null);
  else if (portal === 'without') q = q.is('portal', null);

  const [archived] = f('archived');
  if (archived === 'only') q = q.not('archived_at', 'is', null);
  else if (archived !== 'include') q = q.is('archived_at', null);

  return q as Q;
}

export function applyDirectorySort<Q extends AnyBuilder>(query: Q, params: DirectoryParams, locale: Locale): Q {
  const ascending = params.dir !== 'desc';
  let q: AnyBuilder = query;
  const primaryName = locale === 'en' ? 'name_en' : 'name_ar';
  const secondaryName = locale === 'en' ? 'name_ar' : 'name_en';
  switch (params.sort) {
    case 'employee_number':
      q = q.order('employee_number', { ascending, nullsFirst: false });
      break;
    case 'employment_status':
      q = q.order('employment_status', { ascending });
      break;
    case 'iqama_expiry_date':
      q = q.order('iqama_expiry_date', { ascending, nullsFirst: false });
      break;
    case 'joining_date':
      q = q.order('joining_date', { ascending, nullsFirst: false });
      break;
    default:
      q = q.order(primaryName, { ascending, nullsFirst: false });
  }
  return q.order(primaryName, { ascending: true, nullsFirst: false }).order(secondaryName, { ascending: true }).order('id') as Q;
}

/** When the portal filter is active, the embed must be `!inner`-free but still filterable. */
export async function fetchDirectoryPage(
  supabase: ServerSupabaseClient,
  params: ListParams<DirectorySort, DirectoryFilterKey>,
  viewer: EmployeeViewer,
): Promise<{ rows: DirectoryRow[]; total: number }> {
  let query = supabase.from('employees').select(directorySelect(viewer), { count: 'exact' });
  query = applyDirectoryFilters(query, params, viewer);
  query = applyDirectorySort(query, params, viewer.ctx.locale);
  const { data, error, count } = await query.range(params.from, params.to);
  if (error && params.from > 0) {
    // Offset past the last row (stale `?page=` after filtering/deleting): PostgREST answers 416
    // (PGRST103 — some gateways even drop the connection). Report the real total so the page can
    // send the user to the last page instead of failing.
    const head = applyDirectoryFilters(supabase.from('employees').select('id', { count: 'exact', head: true }), params, viewer);
    const { count: total, error: countError } = await head;
    if (!countError && (total ?? 0) <= params.from) return { rows: [], total: total ?? 0 };
  }
  if (error) throw error;
  return { rows: ((data ?? []) as unknown as DirectoryRow[]).map(normalizeDirectoryRow), total: count ?? 0 };
}

export function normalizeDirectoryRow(row: DirectoryRow): DirectoryRow {
  const portal = Array.isArray(row.portal) ? (row.portal[0] ?? null) : row.portal;
  return { ...row, iqama_expiry_date: row.iqama_expiry_date ?? null, portal };
}

/** Ids of every employee matching the directory filters (exports of child tables). */
export async function fetchDirectoryIds(
  supabase: ServerSupabaseClient,
  params: DirectoryParams,
  viewer: EmployeeViewer,
  limit: number,
): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; from < limit; from += pageSize) {
    let query = supabase.from('employees').select('id, portal:profiles!profiles_employee_id_fkey(id)');
    query = applyDirectoryFilters(query, params, viewer);
    const { data, error } = await query.order('id').range(from, Math.min(from + pageSize, limit) - 1);
    if (error) throw error;
    const rows = (data ?? []) as { id: string }[];
    ids.push(...rows.map((r) => r.id));
    if (rows.length < pageSize) break;
  }
  return ids;
}

export async function getDirectoryStats(viewer: EmployeeViewer): Promise<DirectoryStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('employee_directory_stats', {
    p_manager_id: viewer.isOrgViewer ? undefined : (viewer.employeeId ?? '00000000-0000-0000-0000-000000000000'),
  });
  if (error) {
    console.error('[employees] directory stats failed:', error.code, error.message);
    return null;
  }
  return data as unknown as DirectoryStats;
}

export type DirectoryFilterOptions = {
  departments: Option[];
  jobTitles: Option[];
  locations: Option[];
  managers: Option[];
  nationalities: Option[];
};

function namedOptions(rows: (NamedRef & { is_active?: boolean | null; code?: string | null })[] | null, locale: Locale): Option[] {
  return (rows ?? [])
    .map((r) => ({
      value: r.id,
      label: localized(r, 'name', locale) || r.code || '—',
      keywords: [r.name_ar, r.name_en, r.code].filter((v): v is string => Boolean(v)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

export async function getDirectoryFilterOptions(locale: Locale): Promise<DirectoryFilterOptions> {
  const supabase = await createClient();
  const [departments, jobTitles, locations, extra] = await Promise.all([
    supabase.from('departments').select('id, name_ar, name_en, code').order('name_ar'),
    supabase.from('job_titles').select('id, name_ar, name_en, code').order('name_ar'),
    supabase.from('locations').select('id, name_ar, name_en, code').order('name_ar'),
    supabase.rpc('employee_filter_options'),
  ]);
  for (const r of [departments, jobTitles, locations, extra]) {
    if (r.error) console.error('[employees] filter options failed:', r.error.code, r.error.message);
  }
  const extraData = (extra.data ?? {}) as {
    managers?: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null }[];
    nationalities?: string[];
  };
  return {
    departments: namedOptions(departments.data, locale),
    jobTitles: namedOptions(jobTitles.data, locale),
    locations: namedOptions(locations.data, locale),
    managers: (extraData.managers ?? []).map((m) => ({
      value: m.id,
      label: (locale === 'en' ? m.name_en || m.name_ar : m.name_ar || m.name_en) || m.employee_number || '—',
      description: m.employee_number ?? undefined,
    })),
    nationalities: (extraData.nationalities ?? []).map((n) => ({ value: n, label: n })),
  };
}

/* ─── Master data for the form ───────────────────────────────────────────── */

export async function getMasterDataOptions(locale: Locale, keep: Partial<Record<keyof MasterDataOptions, string | null>> = {}): Promise<MasterDataOptions> {
  const supabase = await createClient();
  const load = (table: 'departments' | 'job_titles' | 'locations' | 'cost_centers', keepId?: string | null) =>
    supabase
      .from(table)
      .select('id, name_ar, name_en, code, is_active')
      .or(keepId ? `is_active.eq.true,id.eq.${keepId}` : 'is_active.eq.true')
      .order('name_ar');
  const [d, j, l, c] = await Promise.all([
    load('departments', keep.departments),
    load('job_titles', keep.jobTitles),
    load('locations', keep.locations),
    load('cost_centers', keep.costCenters),
  ]);
  for (const r of [d, j, l, c]) if (r.error) console.error('[employees] master data failed:', r.error.code, r.error.message);
  return {
    departments: namedOptions(d.data, locale),
    jobTitles: namedOptions(j.data, locale),
    locations: namedOptions(l.data, locale),
    costCenters: namedOptions(c.data, locale),
  };
}

/* ─── Profile ─────────────────────────────────────────────────────────────── */

const RECORD_SELECT =
  '*, department:departments!department_id(id, name_ar, name_en), job_title:job_titles!job_title_id(id, name_ar, name_en), ' +
  'location:locations!location_id(id, name_ar, name_en, city), cost_center:cost_centers!cost_center_id(id, name_ar, name_en)';

/** Directory + employment columns only (managers must not receive identity-document data). */
const TEAM_RECORD_SELECT =
  'id, employee_number, name_ar, name_en, company_email, mobile, alt_mobile, gender, nationality, department_id, division, section, ' +
  'job_title_id, grade, manager_id, employment_type, employment_status, joining_date, probation_end_date, contract_start_date, ' +
  'contract_end_date, termination_date, location_id, cost_center_id, avatar_path, archived_at, created_at, updated_at, ' +
  'department:departments!department_id(id, name_ar, name_en), job_title:job_titles!job_title_id(id, name_ar, name_en), ' +
  'location:locations!location_id(id, name_ar, name_en, city), cost_center:cost_centers!cost_center_id(id, name_ar, name_en)';

const EMPTY_PERSONAL = {
  personal_email: null,
  date_of_birth: null,
  marital_status: null,
  address: null,
  national_id: null,
  id_type: null,
  iqama_issue_date: null,
  iqama_expiry_date: null,
  iqama_expiry_hijri: null,
  iqama_profession: null,
  passport_number: null,
  passport_expiry_date: null,
  employer_number: null,
  is_outside_kingdom: null,
  emergency_contact_name: null,
  emergency_contact_relationship: null,
  emergency_contact_mobile: null,
} satisfies Partial<EmployeeRecord>;

export type ViewerMode = 'org' | 'self' | 'team';

/**
 * Loads an employee the viewer may see (RLS) and the viewer's relation to them. `team` viewers get
 * the directory/employment columns only. Returns null when the row is not visible.
 */
export async function getEmployeeRecord(id: string, viewer: EmployeeViewer): Promise<{ employee: EmployeeRecord; mode: ViewerMode } | null> {
  const supabase = await createClient();
  const isSelf = viewer.employeeId === id;
  // Identity documents, DOB, address, emergency contact: only for the employee themselves and org
  // viewers holding personal data rights — never selected (and so never serialized) for anyone else.
  const full = isSelf || (viewer.isOrgViewer && (viewer.orgCan('personal_data.view') || viewer.orgCan('personal_data.edit')));
  const { data, error } = await supabase
    .from('employees')
    .select(full ? RECORD_SELECT : TEAM_RECORD_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as EmployeeRecord;
  const mode: ViewerMode = viewer.isOrgViewer ? 'org' : isSelf ? 'self' : 'team';
  return { employee: full ? row : { ...EMPTY_PERSONAL, ...row }, mode };
}

export async function getManagerCard(employeeId: string): Promise<ManagerCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_employee_manager', { p_employee_id: employeeId });
  if (error) {
    console.error('[employees] manager lookup failed:', error.code, error.message);
    return null;
  }
  return (data as unknown as ManagerCard | null) ?? null;
}

export type ReportRow = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  avatar_path: string | null;
  employment_status: string;
  job_title: NamedRef | null;
};

export async function getDirectReports(employeeId: string, limit = 8): Promise<{ rows: ReportRow[]; total: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from('employees')
    .select('id, employee_number, name_ar, name_en, avatar_path, employment_status, job_title:job_titles!job_title_id(id, name_ar, name_en)', {
      count: 'exact',
    })
    .eq('manager_id', employeeId)
    .is('archived_at', null)
    .order('name_ar')
    .limit(limit);
  if (error) {
    console.error('[employees] direct reports failed:', error.code, error.message);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []) as unknown as ReportRow[], total: count ?? 0 };
}

export type LeaveSnapshotRow = {
  id: string;
  remaining: number | null;
  pending: number;
  used: number;
  entitlement: number;
  opening_balance: number;
  adjustment: number;
  leave_type: { id: string; code: string; name_ar: string | null; name_en: string | null; color: string | null; sort_order: number | null; deducts_balance: boolean } | null;
};

export async function getLeaveSnapshot(employeeId: string, year: number): Promise<LeaveSnapshotRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leave_balances')
    .select('id, remaining, pending, used, entitlement, opening_balance, adjustment, leave_type:leave_types!leave_type_id(id, code, name_ar, name_en, color, sort_order, deducts_balance)')
    .eq('employee_id', employeeId)
    .eq('year', year);
  if (error) {
    console.error('[employees] leave snapshot failed:', error.code, error.message);
    return [];
  }
  return ((data ?? []) as unknown as LeaveSnapshotRow[])
    .filter((r) => r.leave_type?.deducts_balance)
    .sort((a, b) => (a.leave_type?.sort_order ?? 0) - (b.leave_type?.sort_order ?? 0));
}

export type RecentRequestRow = {
  id: string;
  request_number: string | null;
  title: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  request_type: { key: string; name_ar: string | null; name_en: string | null; icon: string | null; color: string | null } | null;
};

export async function getRecentRequests(employeeId: string, limit = 5): Promise<RecentRequestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('hr_requests')
    .select('id, request_number, title, status, submitted_at, created_at, request_type:request_types!request_type_id(key, name_ar, name_en, icon, color)')
    .eq('employee_id', employeeId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[employees] recent requests failed:', error.code, error.message);
    return [];
  }
  return (data ?? []) as unknown as RecentRequestRow[];
}

export async function getCompensation(employeeId: string): Promise<CompensationRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employee_compensation')
    .select('basic_salary, housing_allowance, transport_allowance, other_allowance, total_salary, currency, effective_date, notes')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) {
    console.error('[employees] compensation failed:', error.code, error.message);
    return null;
  }
  return (data as CompensationRecord | null) ?? null;
}

/** Primary bank account with the IBAN masked (the full value is only sent on explicit reveal). */
export async function getBankAccount(employeeId: string): Promise<BankRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employee_bank_accounts')
    .select('id, bank_name, iban, account_holder, is_primary, created_at')
    .eq('employee_id', employeeId)
    .order('is_primary', { ascending: false })
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[employees] bank account failed:', error.code, error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    bank_name: data.bank_name,
    account_holder: data.account_holder,
    has_iban: Boolean(data.iban),
    iban_masked: data.iban ? maskTail(data.iban) : null,
  };
}

/** Full IBAN for the edit form (bank.edit viewers only — the caller checks). */
export async function getBankAccountForEdit(employeeId: string): Promise<{ bank_name: string | null; iban: string | null; account_holder: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employee_bank_accounts')
    .select('bank_name, iban, account_holder')
    .eq('employee_id', employeeId)
    .order('is_primary', { ascending: false })
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getDependents(employeeId: string): Promise<DependentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employee_dependents')
    .select(
      'id, employee_id, name_ar, name_en, relationship, date_of_birth, nationality, national_id, iqama_expiry_date, passport_number, passport_expiry_date, insurance_status, insurance_member_number, notes',
    )
    .eq('employee_id', employeeId)
    .order('created_at');
  if (error) {
    console.error('[employees] dependents failed:', error.code, error.message);
    return [];
  }
  return (data ?? []) as DependentRecord[];
}

export async function getInsurance(employeeId: string): Promise<InsuranceRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employee_insurance')
    .select('id, employee_id, dependent_id, provider, policy_number, class, member_number, start_date, expiry_date, status')
    .eq('employee_id', employeeId)
    .order('expiry_date', { ascending: false, nullsFirst: false });
  if (error) {
    console.error('[employees] insurance failed:', error.code, error.message);
    return [];
  }
  return (data ?? []) as InsuranceRecord[];
}

export type PortalAccount = { id: string; status: string; email: string | null; last_login_at: string | null };

export async function getPortalAccount(employeeId: string): Promise<PortalAccount | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, status, email, last_login_at')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) {
    console.error('[employees] portal account failed:', error.code, error.message);
    return null;
  }
  return (data as PortalAccount | null) ?? null;
}

/** Counts for the tab badges (only for sections the viewer may read). */
export async function getChildCounts(employeeId: string, include: { dependents: boolean; insurance: boolean }) {
  const supabase = await createClient();
  const [d, i] = await Promise.all([
    include.dependents
      ? supabase.from('employee_dependents').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId)
      : Promise.resolve({ count: null }),
    include.insurance
      ? supabase.from('employee_insurance').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId)
      : Promise.resolve({ count: null }),
  ]);
  return { dependents: d.count ?? null, insurance: i.count ?? null };
}

export const getOrgCurrency = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from('organization_settings').select('currency').maybeSingle();
  return (data as { currency?: string | null } | null)?.currency || 'SAR';
});

/** Localized display name for the page title (RLS: null when not visible). */
export async function getEmployeeTitle(id: string): Promise<string | null> {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('employees').select('name_ar, name_en, employee_number').eq('id', id).maybeSingle();
  if (!data) return null;
  return (ctx.locale === 'en' ? data.name_en || data.name_ar : data.name_ar || data.name_en) || data.employee_number || null;
}
