import 'server-only';

import { cache } from 'react';
import type { SessionContext } from '@/lib/auth/session';
import { addDays, businessDaysBetween, daysBetween, DEFAULT_WORKING_DAYS } from '@/lib/dates';
import { todayIso } from '@/lib/i18n/date-format';
import type { Locale } from '@/lib/i18n/config';
import { toIlikePattern, type ListParams } from '@/lib/list-params';
import { ALL_PERMISSIONS, isPermission, type Permission } from '@/lib/permissions';
import { fileRouteUrl } from '@/lib/storage';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import type {
  BalanceHistory,
  BalanceRow,
  CalendarEvent,
  CalendarHoliday,
  EmployeeRef,
  HolidayRow,
  LeaveRequestListRow,
  LeaveScope,
  LeaveTypeRef,
  LeaveTypeRow,
  Option,
} from './types';

/* ─── Status groups ──────────────────────────────────────────────────────── */

export const LEAVE_PENDING_STATUSES = ['submitted', 'pending_manager_approval', 'pending_hr_review'] as const;
export const LEAVE_APPROVED_STATUSES = ['approved', 'in_progress', 'completed'] as const;
/** Statuses that occupy the calendar (never drafts, returned, rejected or cancelled). */
export const LEAVE_CALENDAR_STATUSES = [...LEAVE_PENDING_STATUSES, ...LEAVE_APPROVED_STATUSES] as const;
export const LEAVE_REQUEST_STATUSES = [
  'pending_manager_approval',
  'pending_hr_review',
  'returned',
  'approved',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
] as const;

/* ─── URL input hygiene ──────────────────────────────────────────────────── */
// Filters arrive straight from the URL; a hand-edited `?type=abc` must be ignored, not reach
// PostgREST as an invalid uuid/date (22P02 → error page).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Keeps only well-formed uuids (max 50) of a filter value list. */
export function uuidFilter(values: readonly string[] | undefined): string[] {
  return (values ?? []).filter((v) => UUID_RE.test(v)).slice(0, 50);
}

function isoDateFilter(value: string | undefined): string | null {
  if (!value || !ISO_DATE_RE.test(value)) return null;
  // Round-trip rejects impossible dates (`2026-02-31` would otherwise roll over to March).
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** PostgREST answers 416 (PGRST103) for an offset past the last row (stale `?page=`). */
function isRangeError(error: { code?: string } | null, from: number): boolean {
  return Boolean(error) && from > 0;
}

/* ─── Access ─────────────────────────────────────────────────────────────── */

type RoleWithPermissions = { role: { data_scope: string | null; role_permissions: { module: string; action: string }[] | null } | null };

/**
 * Permissions held through organization-scoped roles only — mirrors `private.has_org_permission`
 * (a manager's `leave.view` means "my team", not "everyone"). Super admins hold everything.
 */
export const getOrgPermissions = cache(async (ctx: SessionContext): Promise<ReadonlySet<Permission>> => {
  if (ctx.isSuperAdmin) return new Set(ALL_PERMISSIONS);
  if (!ctx.roleDetails.some((r) => r.dataScope === 'organization')) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('role:roles!inner(data_scope, role_permissions(module, action))')
    .eq('user_id', ctx.user.id)
    .eq('role.data_scope', 'organization');
  if (error) {
    console.error('[leave] org permissions lookup failed:', error.code, error.message);
    return new Set();
  }
  const out = new Set<Permission>();
  for (const row of (data ?? []) as unknown as RoleWithPermissions[]) {
    for (const p of row.role?.role_permissions ?? []) {
      const key = `${p.module}.${p.action}`;
      if (isPermission(key)) out.add(key);
    }
  }
  return out;
});

export type LeaveOrgSettings = {
  workingDays: number[];
  weekendDays: number[];
  timeZone: string;
  today: string;
  year: number;
};

/** Organization calendar (working/weekend days) and "today" in the organization time zone. */
export const getLeaveOrgSettings = cache(async (): Promise<LeaveOrgSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from('organization_settings').select('working_days, weekend_days, timezone').maybeSingle();
  const timeZone = data?.timezone || 'Asia/Riyadh';
  const weekendDays = (data?.weekend_days as number[] | null) ?? [5, 6];
  const workingDays = ((data?.working_days as number[] | null) ?? [...DEFAULT_WORKING_DAYS]).filter((d) => !weekendDays.includes(d));
  let today: string;
  try {
    today = todayIso(timeZone);
  } catch {
    today = todayIso();
  }
  return { workingDays, weekendDays, timeZone, today, year: Number(today.slice(0, 4)) };
});

export type LeaveAccess = {
  employeeId: string | null;
  /** Leave rows of the whole organization (`has_org_permission('leave','view')`). */
  orgView: boolean;
  /** Adjust / initialize / edit balances (`has_org_permission('leave','edit')`). */
  orgEdit: boolean;
  /** Manage leave types & public holidays (`settings.edit` or `leave.administer`, organization-scoped). */
  canConfigure: boolean;
  /** Leave exports (`leave.export`). */
  canExport: boolean;
  /** Leave types / public holidays exports (`settings.export`, master-data pattern). */
  canExportConfig: boolean;
  /** Has direct reports. */
  hasTeam: boolean;
  /** May submit a leave request for themselves. */
  canRequest: boolean;
  scopes: LeaveScope[];
  defaultScope: LeaveScope;
};

export const getLeaveAccess = cache(async (ctx: SessionContext): Promise<LeaveAccess> => {
  const org = await getOrgPermissions(ctx);
  const orgView = org.has('leave.view');
  const hasTeam = ctx.directReportsCount > 0;
  const employeeId = ctx.employee?.id ?? ctx.profile.employeeId ?? null;
  const scopes: LeaveScope[] = [];
  if (employeeId) scopes.push('mine');
  if (hasTeam) scopes.push('team');
  if (orgView) scopes.push('org');
  const defaultScope: LeaveScope = orgView ? 'org' : hasTeam ? 'team' : 'mine';
  return {
    employeeId,
    orgView,
    orgEdit: org.has('leave.edit'),
    canConfigure: org.has('settings.edit') || org.has('leave.administer'),
    canExport: ctx.isSuperAdmin || ctx.permissions.has('leave.export'),
    canExportConfig: ctx.isSuperAdmin || ctx.permissions.has('settings.export'),
    hasTeam,
    canRequest: Boolean(employeeId) && (ctx.isSuperAdmin || ctx.permissions.has('leave.create') || ctx.permissions.has('requests.create')),
    scopes: scopes.length ? scopes : ['mine'],
    defaultScope,
  };
});

export function resolveScope(value: string | undefined | null, access: LeaveAccess): LeaveScope {
  return value && (access.scopes as string[]).includes(value) ? (value as LeaveScope) : access.defaultScope;
}

/* ─── Reference data ─────────────────────────────────────────────────────── */

const LEAVE_TYPE_COLUMNS =
  'id, code, name_ar, name_en, description_ar, description_en, is_paid, deducts_balance, default_entitlement, max_days_per_request, day_count_basis, requires_attachment, gender_restriction, color, sort_order, is_active';

export async function listLeaveTypes(options: { activeOnly?: boolean } = {}): Promise<LeaveTypeRow[]> {
  const supabase = await createClient();
  let query = supabase.from('leave_types').select(LEAVE_TYPE_COLUMNS).order('sort_order').order('name_en');
  if (options.activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    default_entitlement: Number(r.default_entitlement),
    max_days_per_request: r.max_days_per_request === null ? null : Number(r.max_days_per_request),
    day_count_basis: r.day_count_basis === 'calendar' ? 'calendar' : 'working',
    gender_restriction: r.gender_restriction === 'male' || r.gender_restriction === 'female' ? r.gender_restriction : null,
  }));
}

export async function listDepartmentOptions(locale: Locale): Promise<Option[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('departments').select('id, name_ar, name_en').eq('is_active', true).order('name_en');
  return (data ?? [])
    .map((d) => ({ value: d.id, label: (locale === 'ar' ? d.name_ar || d.name_en : d.name_en || d.name_ar) ?? '' }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** Label for an `?employee=` filter chip (RLS: only employees the viewer can see). */
export async function getEmployeeOption(employeeId: string, locale: Locale): Promise<Option | null> {
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('employees').select('id, employee_number, name_ar, name_en').eq('id', employeeId).maybeSingle();
  if (!data) return null;
  const name = (locale === 'en' ? data.name_en || data.name_ar : data.name_ar || data.name_en) ?? '';
  return { value: data.id, label: data.employee_number ? `${name} · ${data.employee_number}` : name };
}

/* ─── Mapping helpers ────────────────────────────────────────────────────── */

type EmployeeEmbed = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  avatar_path?: string | null;
  department?: { name_ar: string | null; name_en: string | null } | null;
} | null;

const EMPLOYEE_EMBED =
  'id, employee_number, name_ar, name_en, avatar_path, department_id, manager_id, archived_at, search_text, department:departments!department_id(name_ar, name_en)';

function toEmployeeRef(e: EmployeeEmbed): EmployeeRef {
  return {
    id: e?.id ?? '',
    employee_number: e?.employee_number ?? null,
    name_ar: e?.name_ar ?? null,
    name_en: e?.name_en ?? null,
    avatarUrl: e?.avatar_path ? fileRouteUrl('employee-documents', e.avatar_path) : null,
    department: e?.department ?? null,
  };
}

function toLeaveTypeRef(lt: { id: string; code: string; name_ar: string; name_en: string; color: string } | null): LeaveTypeRef | null {
  return lt ? { id: lt.id, code: lt.code, name_ar: lt.name_ar, name_en: lt.name_en, color: lt.color } : null;
}

/** Applies the leave scope to a query that embeds `employee:employees!inner(...)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyScope<Q extends { eq: (col: string, v: any) => Q }>(query: Q, scope: LeaveScope, access: LeaveAccess): Q {
  if (scope === 'mine') return query.eq('employee_id', access.employeeId ?? '00000000-0000-0000-0000-000000000000');
  if (scope === 'team') return query.eq('employee.manager_id', access.employeeId ?? '00000000-0000-0000-0000-000000000000');
  return query;
}

/* ─── Summary ────────────────────────────────────────────────────────────── */

export type LeaveSummary = {
  scope: LeaveScope;
  onLeaveToday: number | null;
  daysTakenThisYear: number | null;
  pending: number;
  upcoming: number;
  upcomingPending: number;
  annual: { available: number; total: number; pending: number; used: number } | null;
  hasEmployee: boolean;
  coverage: { withBalances: number; activeEmployees: number } | null;
};

export async function getLeaveSummary(access: LeaveAccess, settings: LeaveOrgSettings): Promise<LeaveSummary> {
  const supabase = await createClient();
  const scope = access.defaultScope;
  const { today, year } = settings;
  const in14 = addDays(today, 14) ?? today;

  const base = () =>
    applyScope(
      supabase
        .from('leave_requests')
        .select('id, request:hr_requests!inner(status), employee:employees!inner(manager_id)', { count: 'exact', head: true }),
      scope,
      access,
    );

  const onLeaveQ = scope === 'mine' ? null : base().lte('start_date', today).gte('end_date', today).in('request.status', [...LEAVE_APPROVED_STATUSES]);
  const pendingQ = base().in('request.status', [...LEAVE_PENDING_STATUSES]);
  const upcomingQ = base().gt('start_date', today).lte('start_date', in14).in('request.status', [...LEAVE_CALENDAR_STATUSES]);
  const upcomingPendingQ = base().gt('start_date', today).lte('start_date', in14).in('request.status', [...LEAVE_PENDING_STATUSES]);

  const myBalancesQ = access.employeeId
    ? supabase
        .from('leave_balances')
        .select('used, pending, remaining, opening_balance, entitlement, adjustment, leave_type:leave_types!inner(code)')
        .eq('employee_id', access.employeeId)
        .eq('year', year)
    : null;

  const coverageQ =
    !access.employeeId && access.orgView
      ? Promise.all([
          supabase
            .from('employees')
            .select('id', { count: 'exact', head: true })
            .is('archived_at', null)
            .not('employment_status', 'in', '(resigned,terminated)'),
          supabase
            .from('employees')
            .select('id, leave_balances!inner(id)', { count: 'exact', head: true })
            .is('archived_at', null)
            .not('employment_status', 'in', '(resigned,terminated)')
            .eq('leave_balances.year', year),
        ])
      : null;

  const [onLeave, pending, upcoming, upcomingPending, myBalances, coverage] = await Promise.all([
    onLeaveQ,
    pendingQ,
    upcomingQ,
    upcomingPendingQ,
    myBalancesQ,
    coverageQ,
  ]);

  let annual: LeaveSummary['annual'] = null;
  let daysTaken: number | null = null;
  if (myBalances && !myBalances.error) {
    const rows = myBalances.data ?? [];
    daysTaken = rows.reduce((sum, r) => sum + Number(r.used), 0);
    const a = rows.find((r) => (r.leave_type as unknown as { code: string } | null)?.code === 'annual');
    if (a) {
      const remaining = Number(a.remaining);
      annual = {
        available: remaining - Number(a.pending),
        total: Number(a.opening_balance) + Number(a.entitlement) + Number(a.adjustment),
        pending: Number(a.pending),
        used: Number(a.used),
      };
    }
  }

  return {
    scope,
    onLeaveToday: onLeave ? (onLeave.count ?? 0) : null,
    daysTakenThisYear: daysTaken,
    pending: pending.count ?? 0,
    upcoming: upcoming.count ?? 0,
    upcomingPending: upcomingPending.count ?? 0,
    annual,
    hasEmployee: Boolean(access.employeeId),
    coverage: coverage ? { activeEmployees: coverage[0].count ?? 0, withBalances: coverage[1].count ?? 0 } : null,
  };
}

/* ─── Leave requests list ────────────────────────────────────────────────── */

export const REQUEST_SORTS = ['start_date', 'end_date', 'days', 'employee', 'submitted', 'status'] as const;
export const REQUEST_FILTERS = ['type', 'status', 'department', 'periodFrom', 'periodTo', 'scope', 'employee'] as const;

type LeaveRequestRaw = {
  id: string;
  request_id: string;
  start_date: string;
  end_date: string;
  return_date: string | null;
  days: number;
  balance_effect: string;
  request: { id: string; request_number: string | null; status: string; current_step_type: string | null; submitted_at: string | null } | null;
  employee: EmployeeEmbed;
  leave_type: { id: string; code: string; name_ar: string; name_en: string; color: string } | null;
};

const REQUEST_SELECT = `id, request_id, start_date, end_date, return_date, days, balance_effect,
  request:hr_requests!inner(id, request_number, status, current_step_type, submitted_at),
  employee:employees!inner(${EMPLOYEE_EMBED}),
  leave_type:leave_types(id, code, name_ar, name_en, color)`;

export function buildLeaveRequestsQuery(
  supabase: ServerSupabaseClient,
  params: ListParams,
  access: LeaveAccess,
  locale: Locale,
  options: { count?: boolean; head?: boolean } = {},
) {
  const f = params.filters as Partial<Record<(typeof REQUEST_FILTERS)[number], string[]>>;
  const scope = resolveScope(f.scope?.[0], access);
  let query = supabase
    .from('leave_requests')
    .select(REQUEST_SELECT, options.count || options.head ? { count: 'exact', head: options.head } : undefined);
  query = applyScope(query, scope, access);
  const employee = uuidFilter(f.employee)[0];
  const types = uuidFilter(f.type);
  const statuses = (f.status ?? []).filter((s) => (LEAVE_REQUEST_STATUSES as readonly string[]).includes(s) || s === 'submitted');
  const departments = uuidFilter(f.department);
  const periodFrom = isoDateFilter(f.periodFrom?.[0]);
  const periodTo = isoDateFilter(f.periodTo?.[0]);
  if (employee) query = query.eq('employee_id', employee);
  if (types.length) query = query.in('leave_type_id', types);
  if (statuses.length) query = query.in('request.status', statuses);
  if (departments.length) query = query.in('employee.department_id', departments);
  if (periodFrom) query = query.gte('end_date', periodFrom);
  if (periodTo) query = query.lte('start_date', periodTo);
  if (params.q) {
    const pattern = toIlikePattern(params.q);
    query = /^hr-/i.test(params.q) ? query.ilike('request.request_number', pattern) : query.ilike('employee.search_text', pattern);
  }
  const asc = params.dir === 'asc';
  switch (params.sort) {
    case 'employee':
      query = query.order(locale === 'en' ? 'employee(name_en)' : 'employee(name_ar)', { ascending: asc });
      break;
    case 'submitted':
      query = query.order('request(submitted_at)', { ascending: asc, nullsFirst: false });
      break;
    case 'status':
      query = query.order('request(status)', { ascending: asc });
      break;
    case 'end_date':
    case 'days':
      query = query.order(params.sort, { ascending: asc });
      break;
    default:
      query = query.order('start_date', { ascending: asc });
  }
  return query.order('id');
}

export function mapLeaveRequestRows(raw: unknown[], approvers: Map<string, string | null>): LeaveRequestListRow[] {
  return (raw as LeaveRequestRaw[]).map((r) => ({
    id: r.id,
    request_id: r.request_id,
    request_number: r.request?.request_number ?? null,
    status: r.request?.status ?? 'submitted',
    current_step_type: r.request?.current_step_type ?? null,
    approver_name: approvers.get(r.request_id) ?? null,
    submitted_at: r.request?.submitted_at ?? null,
    start_date: r.start_date,
    end_date: r.end_date,
    return_date: r.return_date,
    days: Number(r.days),
    balance_effect: r.balance_effect,
    employee: toEmployeeRef(r.employee),
    leave_type: toLeaveTypeRef(r.leave_type),
  }));
}

export async function listLeaveRequests(params: ListParams, access: LeaveAccess, locale: Locale) {
  const supabase = await createClient();
  const { data, count, error } = await buildLeaveRequestsQuery(supabase, params, access, locale, { count: true }).range(params.from, params.to);
  if (isRangeError(error, params.from)) {
    // Stale `?page=` past the last row: report the real total so the tab can jump to the last page.
    const { count: total, error: countError } = await buildLeaveRequestsQuery(supabase, params, access, locale, { head: true });
    if (!countError && (total ?? 0) <= params.from) return { rows: [], total: total ?? 0 };
  }
  if (error) throw error;
  const rows = (data ?? []) as unknown as LeaveRequestRaw[];
  const pendingIds = rows.filter((r) => r.request && (LEAVE_PENDING_STATUSES as readonly string[]).includes(r.request.status)).map((r) => r.request_id);
  const approvers = new Map<string, string | null>();
  if (pendingIds.length) {
    const { data: approvals } = await supabase
      .from('request_approvals')
      .select('request_id, approver_name')
      .in('request_id', pendingIds)
      .eq('decision', 'pending');
    for (const a of approvals ?? []) approvers.set(a.request_id, a.approver_name);
  }
  return { rows: mapLeaveRequestRows(rows, approvers), total: count ?? rows.length };
}

/* ─── Balances ───────────────────────────────────────────────────────────── */

export const BALANCE_SORTS = ['employee', 'leave_type', 'opening_balance', 'entitlement', 'adjustment', 'used', 'pending', 'remaining'] as const;
export const BALANCE_FILTERS = ['year', 'type', 'department', 'view'] as const;

type BalanceRaw = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  opening_balance: number;
  entitlement: number;
  adjustment: number;
  used: number;
  pending: number;
  remaining: number;
  leave_type: { id: string; code: string; name_ar: string; name_en: string; color: string; sort_order: number } | null;
  employee?: EmployeeEmbed;
};

function toBalanceRow(r: BalanceRaw): BalanceRow {
  const remaining = Number(r.remaining);
  const pending = Number(r.pending);
  return {
    id: r.id,
    employee_id: r.employee_id,
    leave_type_id: r.leave_type_id,
    year: r.year,
    opening_balance: Number(r.opening_balance),
    entitlement: Number(r.entitlement),
    adjustment: Number(r.adjustment),
    used: Number(r.used),
    pending,
    remaining,
    available: remaining - pending,
    leave_type: {
      id: r.leave_type?.id ?? r.leave_type_id,
      code: r.leave_type?.code ?? '',
      name_ar: r.leave_type?.name_ar ?? '',
      name_en: r.leave_type?.name_en ?? '',
      color: r.leave_type?.color ?? '#5B6B70',
      sort_order: r.leave_type?.sort_order ?? 0,
    },
    employee: r.employee !== undefined ? toEmployeeRef(r.employee) : undefined,
  };
}

const BALANCE_COLUMNS = 'id, employee_id, leave_type_id, year, opening_balance, entitlement, adjustment, used, pending, remaining';

export function buildBalancesQuery(
  supabase: ServerSupabaseClient,
  params: ListParams,
  access: LeaveAccess,
  scope: LeaveScope,
  year: number,
  locale: Locale,
  options: { count?: boolean; head?: boolean } = {},
) {
  const f = params.filters as Partial<Record<(typeof BALANCE_FILTERS)[number], string[]>>;
  let query = supabase
    .from('leave_balances')
    .select(
      `${BALANCE_COLUMNS}, leave_type:leave_types!inner(id, code, name_ar, name_en, color, sort_order), employee:employees!inner(${EMPLOYEE_EMBED})`,
      options.count || options.head ? { count: 'exact', head: options.head } : undefined,
    )
    .eq('year', year)
    .is('employee.archived_at', null);
  query = applyScope(query, scope, access);
  const types = uuidFilter(f.type);
  const departments = uuidFilter(f.department);
  if (types.length) query = query.in('leave_type_id', types);
  if (departments.length) query = query.in('employee.department_id', departments);
  if (params.q) query = query.ilike('employee.search_text', toIlikePattern(params.q));
  const asc = params.dir === 'asc';
  const nameCol = locale === 'en' ? 'employee(name_en)' : 'employee(name_ar)';
  switch (params.sort) {
    case 'leave_type':
      query = query.order('leave_type(sort_order)', { ascending: asc }).order(nameCol);
      break;
    case 'opening_balance':
    case 'entitlement':
    case 'adjustment':
    case 'used':
    case 'pending':
    case 'remaining':
      query = query.order(params.sort, { ascending: asc }).order(nameCol);
      break;
    default:
      query = query.order(nameCol, { ascending: asc }).order('leave_type(sort_order)');
  }
  return query.order('id');
}

export async function listBalances(params: ListParams, access: LeaveAccess, scope: LeaveScope, year: number, locale: Locale) {
  const supabase = await createClient();
  const { data, count, error } = await buildBalancesQuery(supabase, params, access, scope, year, locale, { count: true }).range(params.from, params.to);
  if (isRangeError(error, params.from)) {
    const { count: total, error: countError } = await buildBalancesQuery(supabase, params, access, scope, year, locale, { head: true });
    if (!countError && (total ?? 0) <= params.from) return { rows: [], total: total ?? 0 };
  }
  if (error) throw error;
  return { rows: ((data ?? []) as unknown as BalanceRaw[]).map(toBalanceRow), total: count ?? 0 };
}

export function mapBalanceRows(raw: unknown[]): BalanceRow[] {
  return (raw as BalanceRaw[]).map(toBalanceRow);
}

/** One employee's balances for a year (own cards, employee profile tab). */
export async function getEmployeeBalances(employeeId: string, year: number): Promise<BalanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leave_balances')
    .select(`${BALANCE_COLUMNS}, leave_type:leave_types!inner(id, code, name_ar, name_en, color, sort_order, is_active)`)
    .eq('employee_id', employeeId)
    .eq('year', year)
    .order('leave_type(sort_order)');
  if (error) throw error;
  return ((data ?? []) as unknown as BalanceRaw[]).map(toBalanceRow);
}

/** Years that have balance rows (for the year picker), always including the current year ± 1. */
export async function getBalanceYears(currentYear: number): Promise<number[]> {
  const supabase = await createClient();
  // Two single-row lookups (oldest / newest year) instead of scanning the balances table.
  const [oldest, newest] = await Promise.all([
    supabase.from('leave_balances').select('year').order('year', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('leave_balances').select('year').order('year', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return yearSpan(currentYear, oldest.data?.year, newest.data?.year);
}

/** Current year ± 1 widened to [min, max] of the stored years (capped at 30 years), newest first. */
function yearSpan(currentYear: number, min?: number | null, max?: number | null): number[] {
  const from = Math.max(Math.min(currentYear - 1, min ?? currentYear), currentYear - 30);
  const to = Math.min(Math.max(currentYear + 1, max ?? currentYear), currentYear + 30);
  const years: number[] = [];
  for (let y = to; y >= from; y--) years.push(y);
  return years;
}

/** Adjustments + leave requests that moved one balance. RLS: own balance, direct reports' requests, HR. */
export async function getBalanceHistory(balanceId: string, viewer: Pick<LeaveAccess, 'employeeId' | 'orgView'>): Promise<BalanceHistory | null> {
  const supabase = await createClient();
  const { data: bal, error } = await supabase
    .from('leave_balances')
    .select('id, employee_id, leave_type_id, year, opening_balance, entitlement, adjustment, used, pending, remaining')
    .eq('id', balanceId)
    .maybeSingle();
  if (error) throw error;
  if (!bal) return null;
  const [adj, reqs] = await Promise.all([
    supabase
      .from('leave_adjustments')
      .select('id, amount, reason, old_remaining, new_remaining, changed_at, changer:profiles!changed_by(full_name, email)')
      .eq('leave_balance_id', balanceId)
      .order('changed_at', { ascending: false })
      .limit(200),
    supabase
      .from('leave_requests')
      .select('request_id, start_date, end_date, days, balance_effect, request:hr_requests!inner(request_number, status)')
      .eq('employee_id', bal.employee_id)
      .eq('leave_type_id', bal.leave_type_id)
      .eq('year', bal.year)
      .order('start_date', { ascending: false })
      .limit(200),
  ]);
  if (adj.error) throw adj.error;
  return {
    adjustmentsHidden: !viewer.orgView && viewer.employeeId !== bal.employee_id,
    balance: {
      opening_balance: Number(bal.opening_balance),
      entitlement: Number(bal.entitlement),
      adjustment: Number(bal.adjustment),
      used: Number(bal.used),
      pending: Number(bal.pending),
      remaining: Number(bal.remaining),
    },
    adjustments: (adj.data ?? []).map((a) => {
      const changer = a.changer as unknown as { full_name: string | null; email: string | null } | null;
      return {
        id: a.id,
        amount: Number(a.amount),
        reason: a.reason,
        old_remaining: a.old_remaining === null ? null : Number(a.old_remaining),
        new_remaining: a.new_remaining === null ? null : Number(a.new_remaining),
        changed_by_name: changer?.full_name || changer?.email || null,
        changed_at: a.changed_at,
      };
    }),
    movements: (reqs.data ?? []).map((r) => {
      const req = r.request as unknown as { request_number: string | null; status: string } | null;
      return {
        request_id: r.request_id,
        request_number: req?.request_number ?? null,
        status: req?.status ?? '',
        start_date: r.start_date,
        end_date: r.end_date,
        days: Number(r.days),
        balance_effect: r.balance_effect,
      };
    }),
  };
}

/* ─── Calendar ───────────────────────────────────────────────────────────── */

export async function getCalendarData(
  range: { from: string; to: string },
  scope: LeaveScope,
  access: LeaveAccess,
  filters: { department?: string[]; type?: string[] },
): Promise<{ events: CalendarEvent[]; holidays: CalendarHoliday[]; truncated: boolean }> {
  const supabase = await createClient();
  const LIMIT = 1500;
  // Deliberately never selects request values: the reason stays off the shared calendar.
  let query = supabase
    .from('leave_requests')
    .select(
      'id, request_id, start_date, end_date, days, request:hr_requests!inner(status), employee:employees!inner(id, employee_number, name_ar, name_en, department_id, manager_id), leave_type:leave_types(id, code, name_ar, name_en, color)',
    )
    .lte('start_date', range.to)
    .gte('end_date', range.from)
    .in('request.status', [...LEAVE_CALENDAR_STATUSES]);
  query = applyScope(query, scope, access);
  const types = uuidFilter(filters.type);
  const departments = uuidFilter(filters.department);
  if (types.length) query = query.in('leave_type_id', types);
  if (departments.length) query = query.in('employee.department_id', departments);
  const [eventsRes, holidays] = await Promise.all([
    query.order('start_date').order('id').limit(LIMIT),
    listHolidaysInRange(range.from, range.to),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  type Raw = {
    id: string;
    request_id: string;
    start_date: string;
    end_date: string;
    days: number;
    request: { status: string } | null;
    employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null } | null;
    leave_type: { id: string; code: string; name_ar: string; name_en: string; color: string } | null;
  };
  const rows = (eventsRes.data ?? []) as unknown as Raw[];
  return {
    events: rows.map((r) => ({
      id: r.id,
      request_id: r.request_id,
      start_date: r.start_date,
      end_date: r.end_date,
      days: Number(r.days),
      status: r.request?.status ?? 'submitted',
      state: (LEAVE_APPROVED_STATUSES as readonly string[]).includes(r.request?.status ?? '') ? 'approved' : 'pending',
      employee: {
        id: r.employee?.id ?? '',
        name_ar: r.employee?.name_ar ?? null,
        name_en: r.employee?.name_en ?? null,
        employee_number: r.employee?.employee_number ?? null,
      },
      leave_type: toLeaveTypeRef(r.leave_type),
    })),
    holidays: holidays.map((h) => ({ id: h.id, name_ar: h.name_ar, name_en: h.name_en, start_date: h.start_date, end_date: h.end_date })),
    truncated: rows.length >= LIMIT,
  };
}

/* ─── Public holidays ────────────────────────────────────────────────────── */

async function listHolidaysInRange(from: string, to: string, options: { includeInactive?: boolean } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from('public_holidays')
    .select('id, name_ar, name_en, start_date, end_date, is_active')
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date');
  if (!options.includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listHolidaysForYear(year: number, settings: LeaveOrgSettings): Promise<HolidayRow[]> {
  const rows = await listHolidaysInRange(`${year}-01-01`, `${year}-12-31`, { includeInactive: true });
  return rows.map((h) => ({
    ...h,
    days: (daysBetween(h.start_date, h.end_date) ?? 0) + 1,
    working_days: businessDaysBetween(h.start_date, h.end_date, settings.workingDays),
  }));
}

/** Years offered by the holidays year filter: the current year ± 1 plus any year that has holidays. */
export async function getHolidayYears(currentYear: number): Promise<number[]> {
  const supabase = await createClient();
  const [oldest, newest] = await Promise.all([
    supabase.from('public_holidays').select('start_date').order('start_date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('public_holidays').select('start_date').order('start_date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const year = (iso: string | undefined) => (iso ? Number(iso.slice(0, 4)) : null);
  return yearSpan(currentYear, year(oldest.data?.start_date), year(newest.data?.start_date));
}

/* ─── Request panel ──────────────────────────────────────────────────────── */

export type LeavePanelData = {
  requestId: string;
  employeeId: string;
  status: string;
  submitted: boolean;
  leaveType: LeaveTypeRow | null;
  startDate: string | null;
  endDate: string | null;
  returnDate: string | null;
  /** Days charged per the type's basis (stored at submission, or computed for drafts). */
  days: number | null;
  calendarDays: number | null;
  workingDays: number | null;
  holidaysInRange: CalendarHoliday[];
  balanceEffect: string;
  balance: { before: number; after: number; remaining: number; pending: number; year: number } | null;
  /** Colleagues on leave in the same period (managers / HR only; names and dates only). */
  overlaps: { employee: { id: string; name_ar: string | null; name_en: string | null }; start_date: string; end_date: string; state: 'approved' | 'pending' }[] | null;
};

function jsonText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  return String(value);
}

export async function getLeavePanelData(requestId: string, ctx: SessionContext): Promise<LeavePanelData | null> {
  const supabase = await createClient();
  const [reqRes, lrRes, valuesRes] = await Promise.all([
    supabase.from('hr_requests').select('id, status, employee_id').eq('id', requestId).maybeSingle(),
    supabase.from('leave_requests').select('leave_type_id, start_date, end_date, return_date, days, balance_effect, year').eq('request_id', requestId).maybeSingle(),
    supabase.from('hr_request_values').select('field_key, value').eq('request_id', requestId).in('field_key', ['leave_type', 'start_date', 'end_date', 'return_date']),
  ]);
  if (reqRes.error) throw reqRes.error;
  const req = reqRes.data;
  if (!req) return null;

  const values = new Map((valuesRes.data ?? []).map((v) => [v.field_key, jsonText(v.value)]));
  const lr = lrRes.data;
  const leaveTypeId = lr?.leave_type_id ?? values.get('leave_type') ?? null;
  const startDate = lr?.start_date ?? values.get('start_date') ?? null;
  const endDate = lr?.end_date ?? values.get('end_date') ?? null;
  const returnDate = lr?.return_date ?? values.get('return_date') ?? null;

  const settings = await getLeaveOrgSettings();
  const validRange = Boolean(startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate);

  const [typeRes, holidays] = await Promise.all([
    leaveTypeId
      ? supabase.from('leave_types').select(LEAVE_TYPE_COLUMNS).eq('id', leaveTypeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    validRange ? listHolidaysInRange(startDate!, endDate!) : Promise.resolve([]),
  ]);
  const t = typeRes.data;
  const leaveType: LeaveTypeRow | null = t
    ? {
        ...t,
        default_entitlement: Number(t.default_entitlement),
        max_days_per_request: t.max_days_per_request === null ? null : Number(t.max_days_per_request),
        day_count_basis: t.day_count_basis === 'calendar' ? 'calendar' : 'working',
        gender_restriction: t.gender_restriction === 'male' || t.gender_restriction === 'female' ? t.gender_restriction : null,
      }
    : null;

  const calendarDays = validRange ? (daysBetween(startDate, endDate) ?? 0) + 1 : null;
  const workingDays = validRange ? businessDaysBetween(startDate, endDate, settings.workingDays, holidays) : null;
  const days = lr ? Number(lr.days) : leaveType && calendarDays !== null ? (leaveType.day_count_basis === 'calendar' ? calendarDays : workingDays) : null;
  const effect = lr?.balance_effect ?? 'none';
  const year = lr?.year ?? (startDate ? Number(startDate.slice(0, 4)) : settings.year);

  let balance: LeavePanelData['balance'] = null;
  if (leaveType?.deducts_balance && days !== null) {
    const { data: b } = await supabase
      .from('leave_balances')
      .select('remaining, pending')
      .eq('employee_id', req.employee_id)
      .eq('leave_type_id', leaveType.id)
      .eq('year', year)
      .maybeSingle();
    // Submission always creates the balance row, so a missing row on a submitted request means the
    // viewer may not read it (e.g. a workflow approver outside HR): show no figures rather than a guess.
    if (b || !lr) {
      const remaining = b ? Number(b.remaining) : leaveType.default_entitlement;
      const pending = b ? Number(b.pending) : 0;
      const otherPending = pending - (effect === 'pending' ? days : 0);
      const before = remaining + (effect === 'used' ? days : 0) - otherPending;
      balance = { before, after: before - days, remaining, pending, year };
    }
  }

  // Overlapping colleagues: HR (organization) or the requester's manager only.
  let overlaps: LeavePanelData['overlaps'] = null;
  const access = await getLeaveAccess(ctx);
  const isOwn = access.employeeId === req.employee_id;
  if (validRange && !isOwn) {
    const { data: emp } = await supabase.from('employees').select('id, department_id, manager_id').eq('id', req.employee_id).maybeSingle();
    const isManager = Boolean(emp && access.employeeId && emp.manager_id === access.employeeId);
    if (emp && (access.orgView || isManager)) {
      let q = supabase
        .from('leave_requests')
        .select('start_date, end_date, request:hr_requests!inner(status), employee:employees!inner(id, name_ar, name_en, department_id, manager_id)')
        .neq('employee_id', req.employee_id)
        .lte('start_date', endDate!)
        .gte('end_date', startDate!)
        .in('request.status', [...LEAVE_CALENDAR_STATUSES])
        .order('start_date')
        .limit(30);
      if (isManager && !access.orgView) q = q.eq('employee.manager_id', access.employeeId!);
      else if (emp.manager_id && emp.department_id) q = q.or(`manager_id.eq.${emp.manager_id},department_id.eq.${emp.department_id}`, { referencedTable: 'employee' });
      else if (emp.department_id) q = q.eq('employee.department_id', emp.department_id);
      else if (emp.manager_id) q = q.eq('employee.manager_id', emp.manager_id);
      const { data: rows } = await q;
      type Raw = { start_date: string; end_date: string; request: { status: string } | null; employee: { id: string; name_ar: string | null; name_en: string | null } | null };
      overlaps = ((rows ?? []) as unknown as Raw[])
        .filter((r) => r.employee)
        .map((r) => ({
          employee: { id: r.employee!.id, name_ar: r.employee!.name_ar, name_en: r.employee!.name_en },
          start_date: r.start_date,
          end_date: r.end_date,
          state: (LEAVE_APPROVED_STATUSES as readonly string[]).includes(r.request?.status ?? '') ? 'approved' : 'pending',
        }));
    }
  }

  return {
    requestId,
    employeeId: req.employee_id,
    status: req.status,
    submitted: Boolean(lr),
    leaveType,
    startDate,
    endDate,
    returnDate,
    days,
    calendarDays,
    workingDays,
    holidaysInRange: holidays.map((h) => ({ id: h.id, name_ar: h.name_ar, name_en: h.name_en, start_date: h.start_date, end_date: h.end_date })),
    balanceEffect: effect,
    balance,
    overlaps,
  };
}

/* ─── Employee profile tab ───────────────────────────────────────────────── */

export async function getEmployeeRecentLeave(employeeId: string, limit = 8): Promise<LeaveRequestListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leave_requests')
    .select(REQUEST_SELECT)
    .eq('employee_id', employeeId)
    .order('start_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapLeaveRequestRows(data ?? [], new Map());
}
