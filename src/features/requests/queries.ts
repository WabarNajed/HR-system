import 'server-only';

import { DEFAULT_TIME_ZONE } from '@/lib/i18n/config';
import { toIlikePattern, type ListParams } from '@/lib/list-params';
import { fileRouteUrl } from '@/lib/storage';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import {
  FINAL_STATUSES,
  OPEN_STATUSES,
  TAB_STATUSES,
  type RequestFilterKey,
  type RequestTab,
} from './constants';
import type {
  ApprovalDecisionRow,
  ApprovalPathStep,
  AttachmentItem,
  DependentOption,
  EmployeeOption,
  FieldOption,
  FormLookups,
  LeaveTypeOption,
  RequestAccess,
  RequestCapabilities,
  RequestField,
  RequestListRow,
  RequestStatus,
  RequestTypeDefinition,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builders are chained dynamically below. */
type AnyQuery = any;

/* ─── Viewer access ───────────────────────────────────────────────────────── */

export async function getRequestAccess(supabase: ServerSupabaseClient, userId: string): Promise<RequestAccess> {
  const { data, error } = await supabase.rpc('get_my_request_access');
  if (error) console.error('[requests] get_my_request_access failed:', error.code, error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    active: d.active === true,
    isSuperAdmin: d.is_super_admin === true,
    employeeId: typeof d.employee_id === 'string' ? d.employee_id : null,
    orgView: d.org_view === true,
    orgCreate: d.org_create === true,
    orgEdit: d.org_edit === true,
    orgApprove: d.org_approve === true,
    roleStepIds: Array.isArray(d.role_step_ids) ? (d.role_step_ids as string[]) : [],
    userId,
  };
}

/* ─── Time helpers (organization time zone) ───────────────────────────────── */

function tzOffset(date: Date, timeZone = DEFAULT_TIME_ZONE): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part ?? '');
    if (m) return `${m[1]}:${m[2] ?? '00'}`;
  } catch {
    /* fall through */
  }
  return '+03:00';
}

/** Start of a calendar day (`yyyy-MM-dd`) in the organization time zone, as an ISO timestamp. */
export function dayStartIso(isoDate: string): string {
  return `${isoDate}T00:00:00${tzOffset(new Date(`${isoDate}T12:00:00Z`))}`;
}

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** First day of the current month in the organization time zone. */
export function monthStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: '2-digit' }).format(now);
  return dayStartIso(`${parts.slice(0, 7)}-01`);
}

/* ─── Request types (wizard, filters) ─────────────────────────────────────── */

type RawField = Omit<RequestField, 'options' | 'visibility' | 'validation'> & {
  request_type_id: string;
  options: unknown;
  visibility: unknown;
  validation: unknown;
};

function toField(raw: RawField): RequestField {
  return {
    id: raw.id,
    key: raw.key,
    field_type: raw.field_type,
    label_ar: raw.label_ar,
    label_en: raw.label_en,
    help_ar: raw.help_ar ?? null,
    help_en: raw.help_en ?? null,
    placeholder_ar: raw.placeholder_ar ?? null,
    placeholder_en: raw.placeholder_en ?? null,
    required: raw.required,
    options: Array.isArray(raw.options) ? (raw.options as FieldOption[]) : [],
    sort_order: raw.sort_order,
    visibility: raw.visibility && typeof raw.visibility === 'object' ? (raw.visibility as RequestField['visibility']) : null,
    validation: raw.validation && typeof raw.validation === 'object' ? (raw.validation as RequestField['validation']) : {},
    is_system: raw.is_system,
    is_active: raw.is_active,
  };
}

const FIELD_COLUMNS =
  'id, request_type_id, key, field_type, label_ar, label_en, help_ar, help_en, placeholder_ar, placeholder_en, required, options, sort_order, visibility, validation, is_system, is_active';

type RawType = {
  id: string;
  key: string;
  category: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  icon: string;
  color: string | null;
  sla_business_days: number | null;
  requires_manager_approval: boolean;
  requires_hr_approval: boolean;
  allow_attachments: boolean;
  is_active: boolean;
  sort_order: number;
  workflow_id: string | null;
};

type RawWorkflow = {
  id: string;
  request_type_id: string;
  is_active: boolean;
  created_at: string;
  steps: { step_order: number; step_type: string; name_ar: string; name_en: string; approver_role_key: string | null }[] | null;
};

/** Mirrors private.resolve_steps: explicit workflow → latest active workflow → synthesized manager/HR steps. */
function resolvePath(type: RawType, workflows: RawWorkflow[]): ApprovalPathStep[] {
  const own = workflows.filter((w) => w.request_type_id === type.id && w.is_active);
  const chosen =
    own.find((w) => w.id === type.workflow_id) ?? [...own].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const steps = chosen?.steps ?? [];
  if (steps.length) {
    return [...steps]
      .sort((a, b) => a.step_order - b.step_order)
      .map((s) => ({ order: s.step_order, type: s.step_type, name_ar: s.name_ar, name_en: s.name_en, roleKey: s.approver_role_key }));
  }
  const out: ApprovalPathStep[] = [];
  if (type.requires_manager_approval) out.push({ order: 1, type: 'manager', name_ar: 'اعتماد المدير المباشر', name_en: 'Direct manager approval' });
  if (type.requires_hr_approval || !type.requires_manager_approval) {
    out.push({ order: out.length + 1, type: 'hr', name_ar: 'مراجعة الموارد البشرية', name_en: 'HR review' });
  }
  return out;
}

/**
 * Request types with their fields and approval path. `activeOnly` (wizard) returns active types
 * and active fields; otherwise every visible type (RLS: non-HR users only see active rows).
 */
export async function loadRequestTypes(
  supabase: ServerSupabaseClient,
  options: { activeOnly?: boolean; withFields?: boolean } = {},
): Promise<RequestTypeDefinition[]> {
  const { activeOnly = false, withFields = true } = options;
  let typesQuery = supabase
    .from('request_types')
    .select(
      'id, key, category, name_ar, name_en, description_ar, description_en, icon, color, sla_business_days, requires_manager_approval, requires_hr_approval, allow_attachments, is_active, sort_order, workflow_id',
    )
    .order('sort_order')
    .order('name_en');
  if (activeOnly) typesQuery = typesQuery.eq('is_active', true);

  let fieldsQuery = supabase.from('request_fields').select(FIELD_COLUMNS).order('sort_order');
  if (activeOnly) fieldsQuery = fieldsQuery.eq('is_active', true);
  if (!withFields) fieldsQuery = fieldsQuery.eq('key', 'subtype');

  const [typesRes, fieldsRes, workflowsRes] = await Promise.all([
    typesQuery,
    fieldsQuery,
    supabase
      .from('request_workflows')
      .select('id, request_type_id, is_active, created_at, steps:request_workflow_steps(step_order, step_type, name_ar, name_en, approver_role_key)')
      .eq('is_active', true),
  ]);
  if (typesRes.error) throw typesRes.error;
  if (fieldsRes.error) throw fieldsRes.error;
  if (workflowsRes.error) console.error('[requests] workflows lookup failed:', workflowsRes.error.code, workflowsRes.error.message);

  const fields = ((fieldsRes.data ?? []) as unknown as RawField[]).map((f) => ({ typeId: f.request_type_id, field: toField(f) }));
  const workflows = (workflowsRes.data ?? []) as unknown as RawWorkflow[];

  return ((typesRes.data ?? []) as RawType[]).map((t) => ({
    id: t.id,
    key: t.key,
    category: t.category,
    name_ar: t.name_ar,
    name_en: t.name_en,
    description_ar: t.description_ar,
    description_en: t.description_en,
    icon: t.icon,
    color: t.color,
    sla_business_days: t.sla_business_days,
    allow_attachments: t.allow_attachments,
    sort_order: t.sort_order,
    fields: fields.filter((f) => f.typeId === t.id).map((f) => f.field),
    path: resolvePath(t, workflows),
  }));
}

/** Fields (all visible rows incl. inactive for HR) of one request type. */
export async function loadTypeFields(supabase: ServerSupabaseClient, typeId: string): Promise<RequestField[]> {
  const { data, error } = await supabase.from('request_fields').select(FIELD_COLUMNS).eq('request_type_id', typeId).order('sort_order');
  if (error) throw error;
  return ((data ?? []) as unknown as RawField[]).map(toField);
}

/* ─── Lookups for dynamic fields ──────────────────────────────────────────── */

export async function loadFormLookups(supabase: ServerSupabaseClient, employeeId: string | null): Promise<FormLookups> {
  const [typesRes, employeeRes, dependentsRes] = await Promise.all([
    supabase
      .from('leave_types')
      .select('id, code, name_ar, name_en, color, deducts_balance, requires_attachment, max_days_per_request, day_count_basis, gender_restriction, is_paid')
      .eq('is_active', true)
      .order('sort_order'),
    employeeId ? supabase.from('employees').select('gender').eq('id', employeeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    employeeId
      ? supabase.from('employee_dependents').select('id, name_ar, name_en, relationship').eq('employee_id', employeeId).order('name_ar')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (typesRes.error) console.error('[requests] leave types lookup failed:', typesRes.error.code, typesRes.error.message);
  const gender = (employeeRes.data as { gender: string | null } | null)?.gender ?? null;
  const leaveTypes = ((typesRes.data ?? []) as LeaveTypeOption[]).filter(
    (lt) => !lt.gender_restriction || (employeeId ? lt.gender_restriction === gender : true),
  );
  return { leaveTypes, dependents: (dependentsRes.data ?? []) as DependentOption[] };
}

/* ─── List rows ───────────────────────────────────────────────────────────── */

const LIST_COLUMNS =
  'id, request_number, status, subtype, title, created_at, submitted_at, due_at, completed_at, cancelled_at, updated_at, current_step_type, current_step_id, current_approver_id, assigned_to, requester_id, employee_id, request_type_id';

function listSelect(innerEmployee: boolean): string {
  return `${LIST_COLUMNS},
    request_type:request_types(id, key, name_ar, name_en, icon, color, category),
    employee:employees${innerEmployee ? '!inner' : ''}(id, employee_number, name_ar, name_en, avatar_path, department_id, department:departments!department_id(name_ar, name_en)),
    assignee:profiles!assigned_to(full_name),
    approver:profiles!current_approver_id(full_name),
    step:request_workflow_steps!current_step_id(name_ar, name_en, can_return, can_reassign)`;
}

type RawListRow = {
  id: string;
  request_number: string | null;
  status: RequestStatus;
  subtype: string | null;
  title: string | null;
  created_at: string;
  submitted_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  current_step_type: string | null;
  current_step_id: string | null;
  current_approver_id: string | null;
  assigned_to: string | null;
  requester_id: string | null;
  employee_id: string;
  request_type_id: string;
  request_type: { id: string; key: string; name_ar: string; name_en: string; icon: string; color: string | null; category: string } | null;
  employee: {
    id: string;
    employee_number: string | null;
    name_ar: string | null;
    name_en: string | null;
    avatar_path: string | null;
    department: { name_ar: string | null; name_en: string | null } | null;
  } | null;
  assignee: { full_name: string | null } | null;
  approver: { full_name: string | null } | null;
  step: { name_ar: string | null; name_en: string | null; can_return: boolean; can_reassign: boolean } | null;
};

export type SubtypeMap = Map<string, FieldOption[]>;

/** request_type_id → subtype options (for subtype labels in lists). */
export function subtypeMap(types: RequestTypeDefinition[]): SubtypeMap {
  return new Map(types.map((t) => [t.id, t.fields.find((f) => f.key === 'subtype')?.options ?? []]));
}

export function toListRow(raw: RawListRow, subtypes?: SubtypeMap): RequestListRow {
  return {
    id: raw.id,
    request_number: raw.request_number,
    status: raw.status,
    subtype: raw.subtype,
    title: raw.title,
    created_at: raw.created_at,
    submitted_at: raw.submitted_at,
    due_at: raw.due_at,
    completed_at: raw.completed_at,
    cancelled_at: raw.cancelled_at,
    updated_at: raw.updated_at,
    current_step_type: raw.current_step_type,
    current_step_id: raw.current_step_id,
    current_approver_id: raw.current_approver_id,
    assigned_to: raw.assigned_to,
    requester_id: raw.requester_id,
    employee_id: raw.employee_id,
    type: raw.request_type ? { ...raw.request_type, subtypes: subtypes?.get(raw.request_type_id) ?? [] } : null,
    employee: raw.employee
      ? {
          id: raw.employee.id,
          employee_number: raw.employee.employee_number,
          name_ar: raw.employee.name_ar,
          name_en: raw.employee.name_en,
          avatar_url: raw.employee.avatar_path ? fileRouteUrl('employee-documents', raw.employee.avatar_path) : null,
          department: raw.employee.department ?? null,
        }
      : null,
    assignee_name: raw.assignee?.full_name ?? null,
    approver_name: raw.approver?.full_name ?? null,
    step: raw.step ?? null,
  };
}

/* ─── Filters ─────────────────────────────────────────────────────────────── */

/** PostgREST `or` value quoting (reserved characters are stripped by toIlikePattern). */
function quoted(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

async function searchEmployeeIds(supabase: ServerSupabaseClient, q: string): Promise<string[]> {
  const { data } = await supabase.from('employees').select('id').ilike('search_text', toIlikePattern(q.toLowerCase())).limit(200);
  return (data ?? []).map((r) => r.id);
}

/**
 * "Awaiting my decision" — mirrors private.can_act_on_current_step: manager/user steps assigned to
 * me, the HR queue for org approvers, role-step queues; never my own requests (super admin excepted).
 */
export function pendingForMeOr(access: RequestAccess): string {
  const uid = access.userId;
  const notMine = access.isSuperAdmin
    ? ''
    : `,or(requester_id.is.null,requester_id.neq.${uid})${access.employeeId ? `,employee_id.neq.${access.employeeId}` : ''}`;
  const parts = [`and(status.in.(pending_manager_approval,pending_hr_review),current_step_type.in.(manager,user),current_approver_id.eq.${uid})`];
  if (access.orgApprove) parts.push(`and(status.eq.pending_hr_review,current_step_type.eq.hr${notMine})`);
  if (access.roleStepIds.length) {
    parts.push(
      `and(status.in.(pending_manager_approval,pending_hr_review),current_step_type.eq.role,current_step_id.in.(${access.roleStepIds.join(',')})${notMine})`,
    );
  }
  return parts.join(',');
}

export type RequestListOptions = {
  tab: RequestTab;
  access: RequestAccess;
  typeIdsByKey: Map<string, string>;
  /** Restrict to requests awaiting the viewer's decision (approvals queue). */
  pendingForMe?: boolean;
  /** Restrict to one employee (profile tab). */
  employeeId?: string;
  now?: Date;
};

async function applyFilters(
  supabase: ServerSupabaseClient,
  query: AnyQuery,
  params: Pick<ListParams<string, string>, 'q' | 'filters'>,
  options: RequestListOptions,
): Promise<{ q: AnyQuery } | null> {
  // Returned wrapped: a PostgREST builder is thenable, so resolving it directly would run the query.
  const f = params.filters as Partial<Record<RequestFilterKey, string[]>>;
  const now = options.now ?? new Date();
  let q = query;

  const tabStatuses = TAB_STATUSES[options.tab];
  q = tabStatuses ? q.in('status', tabStatuses as string[]) : q.neq('status', 'draft');
  if (options.pendingForMe) q = q.or(pendingForMeOr(options.access));
  if (options.employeeId) q = q.eq('employee_id', options.employeeId);

  if (params.q) {
    const pattern = toIlikePattern(params.q);
    const ids = await searchEmployeeIds(supabase, params.q);
    const ors = [`request_number.ilike.${quoted(pattern)}`, `title.ilike.${quoted(pattern)}`];
    if (ids.length) ors.push(`employee_id.in.(${ids.join(',')})`);
    q = q.or(ors.join(','));
  }
  if (f.status?.length) q = q.in('status', f.status);
  if (f.type?.length) {
    const ids = f.type.map((k) => options.typeIdsByKey.get(k)).filter((v): v is string => Boolean(v));
    if (!ids.length) return null;
    q = q.in('request_type_id', ids);
  }
  if (f.employee?.length) q = q.in('employee_id', f.employee);
  if (f.department?.length) q = q.in('employee.department_id', f.department);
  if (f.assigned?.length) {
    const ids = f.assigned.map((v) => (v === 'me' ? options.access.userId : v)).filter((v) => v !== 'none' && /^[0-9a-f-]{36}$/i.test(v));
    const parts: string[] = [];
    if (f.assigned.includes('none')) parts.push('assigned_to.is.null');
    if (ids.length) parts.push(`assigned_to.in.(${ids.join(',')})`);
    if (!parts.length) return null;
    q = q.or(parts.join(','));
  }
  const sla = f.sla?.[0];
  if (sla) {
    const nowIso = now.toISOString();
    const soonIso = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    q = q.in('status', OPEN_STATUSES as string[]);
    if (sla === 'overdue') q = q.lt('due_at', nowIso);
    else if (sla === 'due_soon') q = q.gte('due_at', nowIso).lte('due_at', soonIso);
    else if (sla === 'on_track') q = q.gt('due_at', soonIso);
  }
  const from = f.createdFrom?.[0];
  const to = f.createdTo?.[0];
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte('created_at', dayStartIso(from));
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lt('created_at', dayStartIso(nextDay(to)));
  return { q };
}

export async function listRequests(
  supabase: ServerSupabaseClient,
  params: ListParams<string, string>,
  options: RequestListOptions & { subtypes?: SubtypeMap },
): Promise<{ rows: RequestListRow[]; total: number }> {
  const inner = Boolean(params.filters.department?.length);
  const base = supabase.from('hr_requests').select(listSelect(inner), { count: 'exact' });
  const applied = await applyFilters(supabase, base, params, options);
  if (!applied) return { rows: [], total: 0 };
  const sort = params.sort ?? 'created_at';
  const { data, count, error } = await applied.q
    .order(sort, { ascending: params.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(params.from, params.to);
  if (error) throw error;
  return { rows: ((data ?? []) as RawListRow[]).map((r) => toListRow(r, options.subtypes)), total: count ?? 0 };
}

/** All rows (exports), paged. */
export async function listRequestsForExport(
  supabase: ServerSupabaseClient,
  params: ListParams<string, string>,
  options: RequestListOptions & { subtypes?: SubtypeMap; limit: number },
): Promise<RequestListRow[]> {
  const inner = Boolean(params.filters.department?.length);
  const out: RequestListRow[] = [];
  const sort = params.sort ?? 'created_at';
  for (let from = 0; from < options.limit; from += 1000) {
    const base = supabase.from('hr_requests').select(listSelect(inner));
    const applied = await applyFilters(supabase, base, params, options);
    if (!applied) return [];
    const to = Math.min(from + 1000, options.limit) - 1;
    const { data, error } = await applied.q.order(sort, { ascending: params.dir === 'asc', nullsFirst: false }).order('id').range(from, to);
    if (error) throw error;
    const rows = ((data ?? []) as RawListRow[]).map((r) => toListRow(r, options.subtypes));
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

/* ─── Counts & KPIs ───────────────────────────────────────────────────────── */

async function headCount(build: (q: AnyQuery) => AnyQuery, supabase: ServerSupabaseClient): Promise<number> {
  const { count, error } = await build(supabase.from('hr_requests').select('id', { count: 'exact', head: true }));
  if (error) {
    console.error('[requests] count failed:', error.code, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function countRequestTabs(supabase: ServerSupabaseClient): Promise<Record<RequestTab, number>> {
  const entries = await Promise.all(
    (Object.keys(TAB_STATUSES) as RequestTab[]).map(async (tab) => {
      const statuses = TAB_STATUSES[tab];
      const n = await headCount((q) => (statuses ? q.in('status', statuses as string[]) : q.neq('status', 'draft')), supabase);
      return [tab, n] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<RequestTab, number>;
}

export type RequestKpis = {
  open: number;
  awaitingApprovals: number;
  awaitingReturned: number;
  overdue: number;
  dueSoon: number;
  completedThisMonth: number;
};

export async function requestKpis(supabase: ServerSupabaseClient, access: RequestAccess, now = new Date()): Promise<RequestKpis> {
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const [open, awaitingApprovals, awaitingReturned, overdue, dueSoon, completedThisMonth] = await Promise.all([
    headCount((q) => q.in('status', [...OPEN_STATUSES, 'returned']), supabase),
    headCount((q) => q.or(pendingForMeOr(access)), supabase),
    headCount((q) => q.eq('status', 'returned').eq('requester_id', access.userId), supabase),
    headCount((q) => q.in('status', OPEN_STATUSES as string[]).lt('due_at', nowIso), supabase),
    headCount((q) => q.in('status', OPEN_STATUSES as string[]).gte('due_at', nowIso).lte('due_at', soonIso), supabase),
    headCount((q) => q.eq('status', 'completed').gte('completed_at', monthStartIso(now)), supabase),
  ]);
  return { open, awaitingApprovals, awaitingReturned, overdue, dueSoon, completedThisMonth };
}

/* ─── Filter options ──────────────────────────────────────────────────────── */

export type NamedOption = { id: string; name_ar: string | null; name_en: string | null; hint?: string | null };

export async function loadDepartments(supabase: ServerSupabaseClient): Promise<NamedOption[]> {
  const { data } = await supabase.from('departments').select('id, name_ar, name_en').eq('is_active', true).order('name_en').limit(500);
  return (data ?? []) as NamedOption[];
}

/** Employees the viewer can filter by (RLS: team for managers, organization for HR). */
export async function loadEmployeeOptions(supabase: ServerSupabaseClient, limit = 1000): Promise<NamedOption[]> {
  const { data } = await supabase
    .from('employees')
    .select('id, name_ar, name_en, employee_number')
    .is('archived_at', null)
    .order('name_en')
    .limit(limit);
  return ((data ?? []) as { id: string; name_ar: string | null; name_en: string | null; employee_number: string | null }[]).map((e) => ({
    id: e.id,
    name_ar: e.name_ar,
    name_en: e.name_en,
    hint: e.employee_number,
  }));
}

export async function loadRequestHandlers(supabase: ServerSupabaseClient): Promise<{ id: string; label_ar: string; label_en: string }[]> {
  const { data, error } = await supabase.rpc('list_request_handlers');
  if (error) return [];
  return ((data ?? []) as { id: string; full_name: string | null; email: string | null; name_ar: string | null; name_en: string | null }[]).map(
    (h) => ({
      id: h.id,
      label_ar: h.name_ar || h.full_name || h.email || '—',
      label_en: h.name_en || h.full_name || h.email || '—',
    }),
  );
}

/* ─── Approvals: my decisions ─────────────────────────────────────────────── */

export async function listMyDecisions(
  supabase: ServerSupabaseClient,
  params: ListParams<string, string>,
  options: { decisions: ('approved' | 'rejected' | 'returned')[]; access: RequestAccess; typeIdsByKey: Map<string, string>; subtypes?: SubtypeMap },
): Promise<{ rows: ApprovalDecisionRow[]; total: number }> {
  const f = params.filters as Partial<Record<RequestFilterKey, string[]>>;
  const inner = Boolean(f.department?.length || f.type?.length || f.employee?.length || params.q);
  let q: AnyQuery = supabase
    .from('request_approvals')
    .select(`decision, comment, decided_at, step_type, request:hr_requests${inner ? '!inner' : ''}(${listSelect(Boolean(f.department?.length))})`, {
      count: 'exact',
    })
    .eq('approver_id', options.access.userId)
    .in('decision', options.decisions);

  if (f.type?.length) {
    const ids = f.type.map((k) => options.typeIdsByKey.get(k)).filter(Boolean);
    if (!ids.length) return { rows: [], total: 0 };
    q = q.in('request.request_type_id', ids);
  }
  if (f.employee?.length) q = q.in('request.employee_id', f.employee);
  if (f.department?.length) q = q.in('request.employee.department_id', f.department);
  if (params.q) {
    const pattern = toIlikePattern(params.q);
    const ids = await searchEmployeeIds(supabase, params.q);
    const ors = [`request_number.ilike.${quoted(pattern)}`, `title.ilike.${quoted(pattern)}`];
    if (ids.length) ors.push(`employee_id.in.(${ids.join(',')})`);
    q = q.or(ors.join(','), { referencedTable: 'request' });
  }
  const { data, count, error } = await q
    .order('decided_at', { ascending: params.dir === 'asc', nullsFirst: false })
    .range(params.from, params.to);
  if (error) throw error;
  const rows = ((data ?? []) as { decision: ApprovalDecisionRow['decision']; comment: string | null; decided_at: string | null; step_type: string | null; request: RawListRow | null }[])
    .filter((r) => r.request)
    .map((r) => ({
      ...toListRow(r.request!, options.subtypes),
      decision: r.decision,
      decision_comment: r.comment,
      decided_at: r.decided_at,
      decision_step_type: r.step_type,
    }));
  return { rows, total: count ?? 0 };
}

export async function countMyDecisions(supabase: ServerSupabaseClient, userId: string, decisions: string[], sinceIso?: string): Promise<number> {
  let q = supabase.from('request_approvals').select('id', { count: 'exact', head: true }).eq('approver_id', userId).in('decision', decisions);
  if (sinceIso) q = q.gte('decided_at', sinceIso);
  const { count } = await q;
  return count ?? 0;
}

/* ─── Details ─────────────────────────────────────────────────────────────── */

export type RequestHistoryEntry = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor_name: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RequestComment = {
  id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
};

export type WorkflowStepState = {
  step_order: number;
  step_type: string;
  name_ar: string;
  name_en: string;
  state: 'current' | 'upcoming' | 'approved' | 'rejected' | 'returned' | 'skipped' | string;
  approver_id: string | null;
  approver_name: string | null;
  decided_at: string | null;
  comment: string | null;
};

export type RequestDetail = {
  row: RequestListRow;
  priority: string;
  typeDef: {
    id: string;
    key: string;
    name_ar: string;
    name_en: string;
    description_ar: string | null;
    description_en: string | null;
    icon: string;
    color: string | null;
    category: string;
    sla_business_days: number | null;
    allow_attachments: boolean;
  } | null;
  fields: RequestField[];
  values: Record<string, unknown>;
  attachments: (AttachmentItem & { kind: 'existing' })[];
  comments: RequestComment[];
  history: RequestHistoryEntry[];
  workflow: WorkflowStepState[];
  capabilities: RequestCapabilities;
  employee: (EmployeeOption & { avatar_url: string | null; job_title: { name_ar: string | null; name_en: string | null } | null; company_email: string | null }) | null;
  requesterName: string | null;
  /** Filed by someone else (HR) for the employee. */
  filedOnBehalf: boolean;
  returnNote: { note: string | null; actor: string | null; at: string } | null;
  lookups: FormLookups;
};

export async function getRequestDetail(supabase: ServerSupabaseClient, id: string, userId: string): Promise<RequestDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [reqRes, capsRes] = await Promise.all([
    supabase
      .from('hr_requests')
      .select(`${listSelect(false)}, priority, requester:profiles!requester_id(full_name, employee_id)`)
      .eq('id', id)
      .maybeSingle(),
    supabase.rpc('get_request_capabilities', { p_request_id: id }),
  ]);
  if (reqRes.error) throw reqRes.error;
  if (!reqRes.data || !capsRes.data) return null;
  const raw = reqRes.data as unknown as RawListRow & { priority: string; requester: { full_name: string | null; employee_id: string | null } | null };

  const [typeRes, fields, valuesRes, attRes, commentsRes, historyRes, workflowRes, employeeRes] = await Promise.all([
    supabase
      .from('request_types')
      .select('id, key, name_ar, name_en, description_ar, description_en, icon, color, category, sla_business_days, allow_attachments')
      .eq('id', raw.request_type_id)
      .maybeSingle(),
    loadTypeFields(supabase, raw.request_type_id).catch(() => [] as RequestField[]),
    supabase.from('hr_request_values').select('field_key, value').eq('request_id', id),
    supabase
      .from('request_attachments')
      .select('id, field_key, storage_path, file_name, file_size, mime_type, uploaded_by, created_at, uploader:profiles!uploaded_by(full_name)')
      .eq('request_id', id)
      .order('created_at'),
    supabase.from('request_comments').select('id, author_id, author_name, body, is_internal, created_at').eq('request_id', id).order('created_at'),
    supabase
      .from('request_history')
      .select('id, action, from_status, to_status, actor_name, note, metadata, created_at')
      .eq('request_id', id)
      .order('created_at', { ascending: false }),
    supabase.rpc('get_request_workflow', { p_request_id: id }),
    supabase
      .from('employees')
      .select(
        'id, employee_number, name_ar, name_en, avatar_path, company_email, department:departments!department_id(name_ar, name_en), job_title:job_titles!job_title_id(name_ar, name_en)',
      )
      .eq('id', raw.employee_id)
      .maybeSingle(),
  ]);

  const caps = capsRes.data as unknown as RequestCapabilities;
  const values: Record<string, unknown> = {};
  for (const v of (valuesRes.data ?? []) as { field_key: string; value: unknown }[]) values[v.field_key] = v.value;
  if (raw.subtype) values.subtype = raw.subtype;

  const attachments = ((attRes.data ?? []) as {
    id: string;
    field_key: string | null;
    storage_path: string;
    file_name: string;
    file_size: number | null;
    mime_type: string | null;
    uploaded_by: string | null;
    created_at: string;
    uploader: { full_name: string | null } | null;
  }[]).map((a) => ({
    kind: 'existing' as const,
    id: a.id,
    name: a.file_name,
    size: a.file_size,
    mime: a.mime_type,
    path: a.storage_path,
    fieldKey: a.field_key,
    canRemove: caps.can_attach && (a.uploaded_by === userId || caps.can_remove_any_attachment),
    uploadedAt: a.created_at,
    uploaderName: a.uploader?.full_name ?? null,
  }));

  const history = (historyRes.data ?? []) as RequestHistoryEntry[];
  const lastReturn = raw.status === 'returned' ? history.find((h) => h.action === 'return') : undefined;

  // Lookup labels for leave_type / dependent / employee values (read view).
  const employee = employeeRes.data as unknown as
    | (EmployeeOption & { avatar_path: string | null; company_email: string | null; job_title: { name_ar: string | null; name_en: string | null } | null })
    | null;
  const lookups = await loadDetailLookups(supabase, fields, values);

  return {
    row: toListRow(raw, subtypeMap([{ id: raw.request_type_id, fields } as RequestTypeDefinition])),
    priority: raw.priority,
    typeDef: (typeRes.data as RequestDetail['typeDef']) ?? null,
    fields,
    values,
    attachments,
    comments: (commentsRes.data ?? []) as RequestComment[],
    history,
    workflow: (workflowRes.data ?? []) as WorkflowStepState[],
    capabilities: caps,
    employee: employee
      ? {
          id: employee.id,
          employee_number: employee.employee_number,
          name_ar: employee.name_ar,
          name_en: employee.name_en,
          department: employee.department ?? null,
          job_title: employee.job_title ?? null,
          company_email: employee.company_email,
          avatar_url: employee.avatar_path ? fileRouteUrl('employee-documents', employee.avatar_path) : null,
        }
      : null,
    requesterName: raw.requester?.full_name ?? null,
    filedOnBehalf: Boolean(raw.requester && raw.requester.employee_id !== raw.employee_id),
    returnNote: lastReturn ? { note: lastReturn.note, actor: lastReturn.actor_name, at: lastReturn.created_at } : null,
    lookups,
  };
}

async function loadDetailLookups(supabase: ServerSupabaseClient, fields: RequestField[], values: Record<string, unknown>): Promise<FormLookups> {
  const idsOf = (type: string) =>
    fields
      .filter((f) => f.field_type === type)
      .map((f) => values[f.key])
      .filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v));
  const leaveIds = idsOf('leave_type');
  const dependentIds = idsOf('dependent');
  const employeeIds = idsOf('employee');
  const [lt, deps, emps] = await Promise.all([
    leaveIds.length
      ? supabase
          .from('leave_types')
          .select('id, code, name_ar, name_en, color, deducts_balance, requires_attachment, max_days_per_request, day_count_basis, gender_restriction, is_paid')
          .in('id', leaveIds)
      : Promise.resolve({ data: [] }),
    dependentIds.length
      ? supabase.from('employee_dependents').select('id, name_ar, name_en, relationship').in('id', dependentIds)
      : Promise.resolve({ data: [] }),
    employeeIds.length
      ? supabase.from('employees').select('id, employee_number, name_ar, name_en').in('id', employeeIds)
      : Promise.resolve({ data: [] }),
  ]);
  const employees: Record<string, EmployeeOption> = {};
  for (const e of (emps.data ?? []) as EmployeeOption[]) employees[e.id] = e;
  return { leaveTypes: (lt.data ?? []) as LeaveTypeOption[], dependents: (deps.data ?? []) as DependentOption[], employees };
}

/* ─── Drafts (wizard) ─────────────────────────────────────────────────────── */

export type DraftForWizard = {
  id: string;
  typeId: string;
  employeeId: string;
  values: Record<string, unknown>;
  attachments: (AttachmentItem & { kind: 'existing' })[];
};

export async function getDraftForWizard(supabase: ServerSupabaseClient, id: string, userId: string): Promise<DraftForWizard | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase
    .from('hr_requests')
    .select('id, request_type_id, employee_id, subtype, status, requester_id')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.status !== 'draft' || data.requester_id !== userId) return null;
  const [valuesRes, attRes] = await Promise.all([
    supabase.from('hr_request_values').select('field_key, value').eq('request_id', id),
    supabase.from('request_attachments').select('id, field_key, storage_path, file_name, file_size, mime_type, created_at').eq('request_id', id).order('created_at'),
  ]);
  const values: Record<string, unknown> = {};
  for (const v of (valuesRes.data ?? []) as { field_key: string; value: unknown }[]) values[v.field_key] = v.value;
  if (data.subtype) values.subtype = data.subtype;
  return {
    id: data.id,
    typeId: data.request_type_id,
    employeeId: data.employee_id,
    values,
    attachments: ((attRes.data ?? []) as { id: string; field_key: string | null; storage_path: string; file_name: string; file_size: number | null; mime_type: string | null; created_at: string }[]).map(
      (a) => ({
        kind: 'existing' as const,
        id: a.id,
        name: a.file_name,
        size: a.file_size,
        mime: a.mime_type,
        path: a.storage_path,
        fieldKey: a.field_key,
        canRemove: true,
        uploadedAt: a.created_at,
      }),
    ),
  };
}

export const isFinalStatus = (status: string) => (FINAL_STATUSES as readonly string[]).includes(status);
