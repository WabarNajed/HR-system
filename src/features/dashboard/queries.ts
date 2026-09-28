import 'server-only';

import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { emailProvider } from '@/lib/email/send';
import { createClient } from '@/lib/supabase/server';
import type {
  ComplianceCounts,
  DashboardLeave,
  DashboardRequest,
  DashboardStats,
  EmployeeBreakdown,
  ExpiryItem,
} from './types';

/**
 * Dashboard data (server-only, RLS as the signed-in user). Every loader returns a `Loaded<T>` so a
 * failing widget renders its own error state instead of breaking the page. `cache()` dedupes
 * loaders shared by several widgets within one request (e.g. `dashboard_stats`).
 */

export type Loaded<T> = { ok: true; data: T } | { ok: false };

const TIMEOUT_MS = 8000;
export const HR_QUEUE_LIMIT = 6;
export const APPROVAL_QUEUE_LIMIT = 6;
export const RECENT_REQUESTS_LIMIT = 6;
export const MY_LEAVE_LIMIT = 5;

export const OPEN_REQUEST_STATUSES = ['submitted', 'pending_manager_approval', 'pending_hr_review'] as const;
const APPROVED_LEAVE_STATUSES = ['approved', 'in_progress', 'completed'] as const;
const PENDING_LEAVE_STATUSES = ['submitted', 'pending_manager_approval', 'pending_hr_review'] as const;

const REQUEST_COLUMNS =
  'id, request_number, status, title, priority, submitted_at, due_at, created_at, updated_at, current_step_type, ' +
  'request_type:request_types!request_type_id(key, name_ar, name_en, icon, color)';
const REQUEST_SELECT = `${REQUEST_COLUMNS}, employee:employees!employee_id(id, employee_number, name_ar, name_en, avatar_path)`;
/** Same columns, restricted to rows whose employee matches an `employee.*` filter (inner join). */
const REQUEST_SELECT_BY_EMPLOYEE = `${REQUEST_COLUMNS}, employee:employees!employee_id!inner(id, employee_number, name_ar, name_en, avatar_path, manager_id)`;

async function load<T>(label: string, fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[dashboard] ${label} failed`, error);
    return { ok: false };
  }
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ─── dashboard_stats ─────────────────────────────────────────────────────── */

export const getDashboardStats = cache(async (): Promise<Loaded<DashboardStats>> =>
  load('dashboard_stats', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase.rpc('dashboard_stats');
    if (error) throw error;
    return (data ?? {}) as DashboardStats;
  }),
);

/* ─── Employee (self) ─────────────────────────────────────────────────────── */

export const getMyRecentRequests = cache(async (employeeId: string, userId: string): Promise<Loaded<DashboardRequest[]>> =>
  load('my recent requests', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('hr_requests')
      .select(REQUEST_SELECT)
      .or(`employee_id.eq.${employeeId},requester_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(RECENT_REQUESTS_LIMIT);
    if (error) throw error;
    return (data ?? []) as unknown as DashboardRequest[];
  }),
);

type LeaveRow = {
  id: string;
  request_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days: number;
  request: { status: string } | null;
  leave_type: DashboardLeave['leave_type'];
  employee?: DashboardLeave['employee'];
};

function toLeave(rows: LeaveRow[]): DashboardLeave[] {
  return rows.map((r) => ({
    id: r.id,
    request_id: r.request_id,
    employee_id: r.employee_id,
    start_date: r.start_date,
    end_date: r.end_date,
    days: num(r.days),
    status: r.request?.status ?? 'approved',
    leave_type: r.leave_type,
    employee: r.employee ?? null,
  }));
}

/** Own upcoming / ongoing leave: approved (counted by `upcoming_leave`) plus leave awaiting approval. */
export const getMyUpcomingLeave = cache(async (employeeId: string, today: string): Promise<Loaded<DashboardLeave[]>> =>
  load('my upcoming leave', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('leave_requests')
      .select(
        'id, request_id, employee_id, start_date, end_date, days, request:hr_requests!request_id!inner(status), leave_type:leave_types!leave_type_id(code, name_ar, name_en, color)',
      )
      .eq('employee_id', employeeId)
      .gte('end_date', today)
      .in('request.status', [...APPROVED_LEAVE_STATUSES, ...PENDING_LEAVE_STATUSES])
      .order('start_date', { ascending: true })
      .limit(MY_LEAVE_LIMIT);
    if (error) throw error;
    return toLeave((data ?? []) as unknown as LeaveRow[]);
  }),
);

export type DashboardNotification = {
  id: string;
  type: string;
  params: Record<string, unknown> | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export const getLatestNotifications = cache(async (): Promise<Loaded<DashboardNotification[]>> =>
  load('latest notifications', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, params, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return (data ?? []) as DashboardNotification[];
  }),
);

/* ─── Manager ─────────────────────────────────────────────────────────────── */

/** Requests waiting for the caller as the current approver (same population as `manager.pending_approvals`). */
export const getApprovalQueue = cache(async (userId: string): Promise<Loaded<DashboardRequest[]>> =>
  load('approval queue', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('hr_requests')
      .select(REQUEST_SELECT)
      .eq('current_approver_id', userId)
      .in('status', ['pending_manager_approval', 'pending_hr_review'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('submitted_at', { ascending: true })
      .limit(APPROVAL_QUEUE_LIMIT);
    if (error) throw error;
    return (data ?? []) as unknown as DashboardRequest[];
  }),
);

/** Direct reports' leave overlapping [from, to] (approved + awaiting approval). Directory columns only. */
export const getTeamLeave = cache(async (managerEmployeeId: string, from: string, to: string): Promise<Loaded<DashboardLeave[]>> =>
  load('team leave', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('leave_requests')
      .select(
        'id, request_id, employee_id, start_date, end_date, days, request:hr_requests!request_id!inner(status), leave_type:leave_types!leave_type_id(code, name_ar, name_en, color), employee:employees!employee_id!inner(id, employee_number, name_ar, name_en, avatar_path, manager_id)',
      )
      .eq('employee.manager_id', managerEmployeeId)
      .lte('start_date', to)
      .gte('end_date', from)
      .in('request.status', [...APPROVED_LEAVE_STATUSES, ...PENDING_LEAVE_STATUSES])
      .order('start_date', { ascending: true })
      .limit(200);
    if (error) throw error;
    return toLeave((data ?? []) as unknown as LeaveRow[]);
  }),
);

export const getTeamRequests = cache(async (managerEmployeeId: string): Promise<Loaded<DashboardRequest[]>> =>
  load('team requests', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('hr_requests')
      .select(REQUEST_SELECT_BY_EMPLOYEE)
      .eq('employee.manager_id', managerEmployeeId)
      .neq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(6);
    if (error) throw error;
    return (data ?? []) as unknown as DashboardRequest[];
  }),
);

/** Weekend days of the organization calendar (0 = Sunday … 6 = Saturday); defaults to Fri/Sat. */
export const getWeekendDays = cache(async (): Promise<number[]> => {
  try {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data } = await supabase.from('organization_settings').select('weekend_days').limit(1).maybeSingle();
    const days = (data?.weekend_days ?? null) as number[] | null;
    return Array.isArray(days) && days.length ? days : [5, 6];
  } catch (error) {
    unstable_rethrow(error);
    return [5, 6];
  }
});

/* ─── HR ──────────────────────────────────────────────────────────────────── */

/** Open requests across the organization, most urgent (earliest due) first. */
export const getHrRequestQueue = cache(async (): Promise<Loaded<DashboardRequest[]>> =>
  load('hr request queue', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('hr_requests')
      .select(REQUEST_SELECT)
      .in('status', [...OPEN_REQUEST_STATUSES])
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('submitted_at', { ascending: true })
      .limit(HR_QUEUE_LIMIT);
    if (error) throw error;
    return (data ?? []) as unknown as DashboardRequest[];
  }),
);

/** Expired / expiring (≤ 90 days) items — organization-wide under RLS, or one employee's when given. */
export const getExpiryItems = cache(async (limit: number, employeeId?: string): Promise<Loaded<ExpiryItem[]>> =>
  load('expiry items', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase.rpc('dashboard_expiry_items', {
      p_days: 90,
      p_limit: limit,
      ...(employeeId ? { p_employee_id: employeeId } : {}),
    });
    if (error) throw error;
    return ((data ?? []) as ExpiryItem[]).map((r) => ({ ...r, days_left: num(r.days_left) }));
  }),
);

const EXPIRY_ITEM_KINDS = ['iqama', 'passport', 'contract', 'insurance', 'document'] as const;

/** Expired / ≤30 / ≤90-day counts per kind — same source (`expiry_items`) as the documents expiry view. */
export const getComplianceCounts = cache(async (): Promise<Loaded<ComplianceCounts>> =>
  load('compliance counts', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase.rpc('dashboard_compliance_counts');
    if (error) throw error;
    const raw = (data ?? {}) as Partial<Record<string, { expired?: unknown; d30?: unknown; d90?: unknown }>>;
    return Object.fromEntries(
      EXPIRY_ITEM_KINDS.map((k) => [k, { expired: num(raw[k]?.expired), d30: num(raw[k]?.d30), d90: num(raw[k]?.d90) }]),
    ) as ComplianceCounts;
  }),
);

export const getEmployeeBreakdown = cache(async (): Promise<Loaded<EmployeeBreakdown>> =>
  load('employee breakdown', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase.rpc('dashboard_employee_breakdown');
    if (error) throw error;
    const raw = (data ?? {}) as Partial<EmployeeBreakdown>;
    return {
      total: num(raw.total),
      by_department: (raw.by_department ?? []).map((d) => ({ ...d, count: num(d.count) })),
      by_nationality: (raw.by_nationality ?? []).map((d) => ({ ...d, count: num(d.count) })),
    };
  }),
);

export type AuditFeedRow = {
  id: number;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  employee_id: string | null;
  summary: string | null;
  actor_id: string | null;
  actor_email: string | null;
};

export const getRecentAudit = cache(async (): Promise<Loaded<AuditFeedRow[]>> =>
  load('recent audit', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, created_at, action, entity_type, entity_id, employee_id, summary, actor_id, actor_email')
      .order('created_at', { ascending: false })
      .limit(6);
    if (error) throw error;
    return (data ?? []) as AuditFeedRow[];
  }),
);

/* ─── Super admin ─────────────────────────────────────────────────────────── */

/** Actions recorded in the last 24 hours with counts (RPC `audit_log_facets`). */
export const getAuditActivity24h = cache(async (): Promise<Loaded<{ action: string; total: number }[]>> =>
  load('audit activity', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.rpc('audit_log_facets', { p_since: since });
    if (error) throw error;
    return (data ?? [])
      .filter((r) => r.facet === 'action' && r.value)
      .map((r) => ({ action: r.value as string, total: num(r.total) }))
      .sort((a, b) => b.total - a.total || a.action.localeCompare(b.action));
  }),
);

export type HealthCheckKey =
  | 'organization'
  | 'branding'
  | 'departments'
  | 'jobTitles'
  | 'locations'
  | 'employees'
  | 'employeeDepartments'
  | 'leaveBalances'
  | 'publicHolidays'
  | 'workflows'
  | 'hrAdmin'
  | 'email';

export type HealthCheck = {
  key: HealthCheckKey;
  ok: boolean;
  /** Count shown in the description (missing items, configured items…). */
  count?: number;
  href: string;
};

export type OrgHealth = { checks: HealthCheck[]; setupCompleted: boolean };

export const getOrgHealth = cache(async (year: number): Promise<Loaded<OrgHealth>> =>
  load('org health', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const head = { count: 'exact' as const, head: true };
    const [org, settings, departments, jobTitles, locations, employees, noDept, balances, holidays, noWorkflow, hrAdmins] =
      await Promise.all([
        supabase.from('organizations').select('name_ar, name_en, hr_email, logo_path').limit(1).maybeSingle(),
        supabase.from('organization_settings').select('setup_completed_at').limit(1).maybeSingle(),
        supabase.from('departments').select('id', head).eq('is_active', true),
        supabase.from('job_titles').select('id', head).eq('is_active', true),
        supabase.from('locations').select('id', head).eq('is_active', true),
        supabase.from('employees').select('id', head).is('archived_at', null).not('employment_status', 'in', '(resigned,terminated)'),
        supabase
          .from('employees')
          .select('id', head)
          .is('archived_at', null)
          .not('employment_status', 'in', '(resigned,terminated)')
          .is('department_id', null),
        supabase
          .from('employees')
          .select('id, leave_balances!inner(year)', head)
          .is('archived_at', null)
          .not('employment_status', 'in', '(resigned,terminated)')
          .eq('leave_balances.year', year),
        supabase.from('public_holidays').select('id', head).eq('is_active', true).gte('end_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
        supabase.from('request_types').select('id', head).eq('is_active', true).is('workflow_id', null),
        supabase.from('user_roles').select('user_id, role:roles!role_id!inner(key), profile:profiles!user_id!inner(status)').eq('role.key', 'hr_admin').eq('profile.status', 'active'),
      ]);
    for (const res of [org, settings, departments, jobTitles, locations, employees, noDept, balances, holidays, noWorkflow, hrAdmins]) {
      if (res.error) throw res.error;
    }
    const activeEmployees = employees.count ?? 0;
    const withBalances = balances.count ?? 0;
    const o = org.data;
    const checks: HealthCheck[] = [
      { key: 'organization', ok: Boolean(o?.name_ar && o?.name_en && o?.hr_email), href: '/settings/organization' },
      { key: 'branding', ok: Boolean(o?.logo_path), href: '/settings/branding' },
      { key: 'departments', ok: (departments.count ?? 0) > 0, count: departments.count ?? 0, href: '/settings/departments' },
      { key: 'jobTitles', ok: (jobTitles.count ?? 0) > 0, count: jobTitles.count ?? 0, href: '/settings/job-titles' },
      { key: 'locations', ok: (locations.count ?? 0) > 0, count: locations.count ?? 0, href: '/settings/locations' },
      { key: 'employees', ok: activeEmployees > 0, count: activeEmployees, href: '/admin/data-management' },
      { key: 'employeeDepartments', ok: (noDept.count ?? 0) === 0, count: noDept.count ?? 0, href: '/employees' },
      {
        key: 'leaveBalances',
        ok: activeEmployees === 0 || withBalances >= activeEmployees,
        count: Math.max(0, activeEmployees - withBalances),
        href: '/leave',
      },
      { key: 'publicHolidays', ok: (holidays.count ?? 0) > 0, count: holidays.count ?? 0, href: '/settings/public-holidays' },
      { key: 'workflows', ok: (noWorkflow.count ?? 0) === 0, count: noWorkflow.count ?? 0, href: '/settings/workflows' },
      { key: 'hrAdmin', ok: (hrAdmins.data ?? []).length > 0, count: (hrAdmins.data ?? []).length, href: '/settings/users' },
      { key: 'email', ok: emailProvider() !== null, href: '/settings/email-templates' },
    ];
    return { checks, setupCompleted: Boolean(settings.data?.setup_completed_at) };
  }),
);

export type RoleSummary = { id: string; key: string; name_ar: string | null; name_en: string | null; is_system: boolean; users: number };

export const getRolesSummary = cache(async (): Promise<Loaded<RoleSummary[]>> =>
  load('roles summary', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('roles')
      .select('id, key, name_ar, name_en, is_system, rank, user_roles(count)')
      .order('rank', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => {
      const agg = (r as unknown as { user_roles: { count: number }[] | null }).user_roles;
      return { id: r.id, key: r.key, name_ar: r.name_ar, name_en: r.name_en, is_system: r.is_system, users: num(agg?.[0]?.count) };
    });
  }),
);

export type PendingRegistration = {
  id: string;
  full_name: string | null;
  email: string | null;
  registration_employee_number: string | null;
  status: string;
  created_at: string;
  matched_employee_id: string | null;
};

export const getPendingRegistrations = cache(async (): Promise<Loaded<PendingRegistration[]>> =>
  load('pending registrations', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, registration_employee_number, status, created_at, matched_employee_id')
      .in('status', ['pending', 'info_requested'])
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return (data ?? []) as PendingRegistration[];
  }),
);

export type RecentImport = {
  id: string;
  import_type: string;
  file_name: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  error_rows: number;
  created_at: string;
};

export const getRecentImports = cache(async (): Promise<Loaded<RecentImport[]>> =>
  load('recent imports', async () => {
    const supabase = await createClient({ timeoutMs: TIMEOUT_MS });
    const { data, error } = await supabase
      .from('imports')
      .select('id, import_type, file_name, status, total_rows, imported_rows, error_rows, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return (data ?? []) as RecentImport[];
  }),
);
