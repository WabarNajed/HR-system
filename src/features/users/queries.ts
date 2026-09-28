import 'server-only';

import { can, hasAny } from '@/lib/permissions';
import type { SessionContext } from '@/lib/auth/session';
import { parseListParams, toIlikePattern, type ListParams, type SearchParamsInput } from '@/lib/list-params';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import type {
  DataScope,
  EmployeePickerOption,
  EmployeeRef,
  MatchKind,
  PortalAccess,
  ProfileStatus,
  RegistrationRow,
  RegistrationStats,
  RegistrationTab,
  RoleOption,
  UserRow,
  UserStats,
} from './types';

/**
 * Users-module reads (RLS as the signed-in user: HR / `users.view` can read every profile and
 * role assignment). Lists are paginated server-side with `parseListParams`.
 */

export const USER_SORTS = ['name', 'email', 'last_login', 'created', 'status'] as const;
export const USER_FILTER_KEYS = ['role', 'status'] as const;
export type UserSort = (typeof USER_SORTS)[number];

const SORT_COLUMN: Record<UserSort, string> = {
  name: 'full_name',
  email: 'email',
  last_login: 'last_login_at',
  created: 'created_at',
  status: 'status',
};

const EMPLOYEE_REF = 'id, employee_number, name_ar, name_en';

type RawUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  mobile: string | null;
  status: ProfileStatus;
  last_login_at: string | null;
  created_at: string;
  invited_at: string | null;
  employee: EmployeeRef | null;
  user_roles: { role: { key: string } | null }[] | null;
};

function toUserRow(r: RawUser, selfId: string): UserRow {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    mobile: r.mobile,
    status: r.status,
    roles: (r.user_roles ?? []).map((ur) => ur.role?.key).filter((k): k is string => Boolean(k)),
    employee: r.employee ?? null,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
    invitedAt: r.invited_at,
    invitationPending: Boolean(r.invited_at) && !r.last_login_at && r.status === 'active',
    isSelf: r.id === selfId,
  };
}

const USER_SELECT = `id, email, full_name, mobile, status, last_login_at, created_at, invited_at, employee:employees!employee_id(${EMPLOYEE_REF}), user_roles(role:roles(key))`;


/**
 * Users list query shared by the page and the `users` export: role filter (inner-joined user_roles),
 * status filter (incl. the derived `invited`), search and sort. `null` = no row can match.
 * Wrapped in `{ query }` so the (thenable) builder isn't executed by `await`.
 */
export async function buildUsersQuery(supabase: ServerSupabaseClient, params: ListParams, withCount: boolean) {
  const roleFilter = params.filters.role?.filter((k) => /^[a-z][a-z0-9_]{0,62}$/.test(k));
  if (params.filters.role?.length && !roleFilter?.length) return null;
  // Role filter as an inner-joined embed (`rf`) — one query, no id list in the URL (scales to any org size).
  const select = roleFilter?.length ? `${USER_SELECT}, rf:user_roles!inner(rr:roles!inner(key))` : USER_SELECT;
  let query = supabase.from('profiles').select(select, withCount ? { count: 'exact' } : undefined);
  if (roleFilter?.length) query = query.in('rf.rr.key', roleFilter);
  const statuses = params.filters.status?.filter((s) => ['active', 'disabled', 'pending', 'info_requested', 'rejected', 'invited'].includes(s));
  if (statuses?.length) {
    const plain = statuses.filter((s) => s !== 'invited');
    if (statuses.includes('invited')) {
      // "Invitation pending" = active, invited by an admin, never signed in.
      query = plain.length
        ? query.or(`status.in.(${plain.join(',')}),and(status.eq.active,invited_at.not.is.null,last_login_at.is.null)`)
        : query.eq('status', 'active').not('invited_at', 'is', null).is('last_login_at', null);
    } else {
      query = query.in('status', plain);
    }
  }
  if (params.q) {
    const pattern = toIlikePattern(params.q);
    query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern},mobile.ilike.${pattern}`);
  }
  const sort = SORT_COLUMN[((params.sort as UserSort | null) ?? 'name') as UserSort] ?? 'full_name';
  query = query.order(sort, { ascending: params.dir === 'asc', nullsFirst: false });
  if (sort !== 'full_name') query = query.order('full_name', { ascending: true, nullsFirst: false });
  return { query: query.order('id', { ascending: true }) };
}

export type RawUserRow = RawUser;
export { toUserRow };

/* ─── roles ────────────────────────────────────────────────────────────────── */

export async function listRoles(supabase?: ServerSupabaseClient): Promise<RoleOption[]> {
  const client = supabase ?? (await createClient());
  const { data, error } = await client
    .from('roles')
    .select('id, key, name_ar, name_en, description_ar, description_en, is_system, rank, data_scope, user_roles(count)')
    .order('rank', { ascending: false })
    .order('name_en', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const counts = (r as unknown as { user_roles: { count: number }[] | null }).user_roles;
    return {
      id: r.id,
      key: r.key,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      descriptionAr: r.description_ar,
      descriptionEn: r.description_en,
      isSystem: r.is_system,
      dataScope: r.data_scope as DataScope,
      rank: r.rank,
      memberCount: counts?.[0]?.count ?? 0,
    };
  });
}

/* ─── users ────────────────────────────────────────────────────────────────── */

export async function listUsers(
  searchParams: SearchParamsInput,
  ctx: SessionContext,
): Promise<{ rows: UserRow[]; total: number; params: ListParams<UserSort, (typeof USER_FILTER_KEYS)[number]> }> {
  const params = parseListParams(searchParams, {
    defaultSort: 'name' as UserSort,
    defaultDir: 'asc',
    allowedSorts: USER_SORTS,
    filterKeys: USER_FILTER_KEYS,
  });
  const supabase = await createClient();
  const built = await buildUsersQuery(supabase, params, true);
  if (!built) return { rows: [], total: 0, params };
  const { data, error, count } = await built.query.range(params.from, params.to);
  if (error) throw error;
  return { rows: ((data ?? []) as unknown as RawUser[]).map((r) => toUserRow(r, ctx.user.id)), total: count ?? 0, params };
}

export async function getUserStats(): Promise<UserStats> {
  const supabase = await createClient();
  const head = { count: 'exact' as const, head: true };
  const [total, active, invited, disabled, pending] = await Promise.all([
    supabase.from('profiles').select('id', head),
    supabase.from('profiles').select('id', head).eq('status', 'active'),
    supabase.from('profiles').select('id', head).eq('status', 'active').not('invited_at', 'is', null).is('last_login_at', null),
    supabase.from('profiles').select('id', head).eq('status', 'disabled'),
    supabase.from('profiles').select('id', head).in('status', ['pending', 'info_requested']),
  ]);
  for (const r of [total, active, invited, disabled, pending]) if (r.error) throw r.error;
  return {
    total: total.count ?? 0,
    active: active.count ?? 0,
    invited: invited.count ?? 0,
    disabled: disabled.count ?? 0,
    pendingRegistrations: pending.count ?? 0,
  };
}

export async function getUserById(userId: string, ctx: SessionContext): Promise<UserRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select(USER_SELECT).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? toUserRow(data as unknown as RawUser, ctx.user.id) : null;
}

/* ─── portal access (employee profile card) ────────────────────────────────── */

export async function getPortalAccess(employeeId: string, ctx: SessionContext): Promise<PortalAccess> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select(USER_SELECT).eq('employee_id', employeeId).maybeSingle();
  if (error) throw error;
  if (!data) return { user: null };
  const row = toUserRow(data as unknown as RawUser, ctx.user.id);
  return {
    user: {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      status: row.status,
      roles: row.roles,
      lastLoginAt: row.lastLoginAt,
      invitedAt: row.invitedAt,
      invitationPending: row.invitationPending,
      isSelf: row.isSelf,
    },
  };
}

/* ─── registrations ────────────────────────────────────────────────────────── */

export const REGISTRATION_SORTS = ['submitted', 'name'] as const;
type RegistrationSort = (typeof REGISTRATION_SORTS)[number];

type RawRegistration = {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  registration_employee_number: string | null;
  registration_note: string | null;
  status: ProfileStatus;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  matched_employee_id: string | null;
};

type MatchEmployee = EmployeeRef & { national_id: string | null };

const MATCH_SELECT = `${EMPLOYEE_REF}, national_id, department:departments!department_id(name_ar, name_en), job_title:job_titles!job_title_id(name_ar, name_en)`;

/** Days kept on the "Rejected (recent)" tab. */
export const REJECTED_WINDOW_DAYS = 90;

function sinceDays(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function listRegistrations(
  tab: RegistrationTab,
  searchParams: SearchParamsInput,
): Promise<{ rows: RegistrationRow[]; total: number; params: ListParams<RegistrationSort> }> {
  const params = parseListParams(searchParams, {
    defaultSort: 'submitted' as RegistrationSort,
    defaultDir: tab === 'rejected' ? 'desc' : 'asc',
    allowedSorts: REGISTRATION_SORTS,
  });
  const supabase = await createClient();
  let query = supabase
    .from('profiles')
    .select(
      'id, full_name, email, mobile, registration_employee_number, registration_note, status, review_note, reviewed_at, reviewed_by, created_at, updated_at, matched_employee_id',
      { count: 'exact' },
    )
    .eq('status', tab);
  if (tab === 'rejected') query = query.gte('reviewed_at', sinceDays(REJECTED_WINDOW_DAYS));
  if (params.q) {
    const pattern = toIlikePattern(params.q);
    query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern},registration_employee_number.ilike.${pattern},mobile.ilike.${pattern}`);
  }
  query =
    params.sort === 'name'
      ? query.order('full_name', { ascending: params.dir === 'asc', nullsFirst: false })
      : query.order(tab === 'rejected' ? 'reviewed_at' : 'created_at', { ascending: params.dir === 'asc' });
  query = query.order('id').range(params.from, params.to);
  const { data, error, count } = await query;
  if (error) throw error;
  const raw = (data ?? []) as RawRegistration[];
  const rows = await attachMatches(supabase, raw);
  return { rows, total: count ?? 0, params };
}

export async function getRegistration(profileId: string): Promise<RegistrationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, mobile, registration_employee_number, registration_note, status, review_note, reviewed_at, reviewed_by, created_at, updated_at, matched_employee_id',
    )
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [row] = await attachMatches(supabase, [data as RawRegistration]);
  return row ?? null;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Resolves the suggested employee for each registration: the trigger's `matched_employee_id` when
 * set, otherwise a live lookup of the entered ID against employee numbers and Iqama/National IDs
 * (unique, non-archived matches only — the applicant may have corrected their ID since).
 */
async function attachMatches(supabase: ServerSupabaseClient, raw: RawRegistration[]): Promise<RegistrationRow[]> {
  const entered = Array.from(new Set(raw.map((r) => r.registration_employee_number?.trim()).filter((v): v is string => Boolean(v))));
  const matchedIds = Array.from(new Set(raw.map((r) => r.matched_employee_id).filter((v): v is string => Boolean(v))));
  const candidates = new Map<string, MatchEmployee>();

  const lookups: PromiseLike<{ data: unknown; error: unknown }>[] = [];
  if (matchedIds.length) lookups.push(supabase.from('employee_records').select(MATCH_SELECT).in('id', matchedIds));
  if (entered.length) {
    const variants = Array.from(new Set(entered.flatMap((v) => [v, v.toUpperCase(), v.toLowerCase()])));
    const list = variants.map((v) => `"${v.replace(/"/g, '')}"`).join(',');
    lookups.push(
      supabase
        .from('employee_records')
        .select(MATCH_SELECT)
        .is('archived_at', null)
        .or(`employee_number.in.(${list}),national_id.in.(${list})`)
        .limit(200),
    );
  }
  const results = await Promise.all(lookups);
  for (const res of results) {
    if (res.error) throw res.error;
    for (const e of (res.data ?? []) as MatchEmployee[]) candidates.set(e.id, e);
  }

  const all = Array.from(candidates.values());
  const findUnique = (value: string): { employee: MatchEmployee; kind: MatchKind } | null => {
    const byNumber = all.filter((e) => norm(e.employee_number) === norm(value));
    if (byNumber.length === 1) return { employee: byNumber[0]!, kind: 'number' };
    const byId = all.filter((e) => (e.national_id ?? '').trim() === value.trim());
    if (byId.length === 1 && byNumber.length === 0) return { employee: byId[0]!, kind: 'nationalId' };
    return null;
  };

  const resolved = raw.map((r) => {
    const value = r.registration_employee_number?.trim() ?? '';
    let employee: MatchEmployee | null = null;
    let kind: MatchKind = 'none';
    if (r.matched_employee_id && candidates.has(r.matched_employee_id)) {
      employee = candidates.get(r.matched_employee_id)!;
      kind = norm(employee.employee_number) === norm(value) ? 'number' : (employee.national_id ?? '').trim() === value ? 'nationalId' : 'number';
    } else if (value) {
      const found = findUnique(value);
      if (found) {
        employee = found.employee;
        kind = found.kind;
      }
    }
    return { r, employee, kind };
  });

  const employeeIds = Array.from(new Set(resolved.map((x) => x.employee?.id).filter((v): v is string => Boolean(v))));
  const linkedTo = new Map<string, string>();
  if (employeeIds.length) {
    const { data, error } = await supabase.from('profiles').select('id, employee_id').in('employee_id', employeeIds);
    if (error) throw error;
    for (const p of data ?? []) if (p.employee_id) linkedTo.set(p.employee_id, p.id);
  }

  return resolved.map(({ r, employee, kind }) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    mobile: r.mobile,
    enteredId: r.registration_employee_number,
    note: r.registration_note,
    status: r.status,
    reviewNote: r.review_note,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // national_id is used for matching only — never sent to the browser
    match: employee
      ? {
          id: employee.id,
          employee_number: employee.employee_number,
          name_ar: employee.name_ar,
          name_en: employee.name_en,
          department: employee.department ?? null,
          job_title: employee.job_title ?? null,
          linked: linkedTo.has(employee.id) && linkedTo.get(employee.id) !== r.id,
        }
      : null,
    matchKind: employee ? kind : 'none',
  }));
}

export async function getRegistrationStats(): Promise<RegistrationStats & { oldestPendingAt: string | null }> {
  const supabase = await createClient();
  const head = { count: 'exact' as const, head: true };
  const [pending, info, rejected, approved, oldest] = await Promise.all([
    supabase.from('profiles').select('id', head).eq('status', 'pending'),
    supabase.from('profiles').select('id', head).eq('status', 'info_requested'),
    supabase.from('profiles').select('id', head).eq('status', 'rejected').gte('reviewed_at', sinceDays(30)),
    supabase
      .from('profiles')
      .select('id', head)
      .eq('status', 'active')
      .is('invited_at', null)
      .not('registration_employee_number', 'is', null)
      .gte('reviewed_at', sinceDays(30)),
    supabase.from('profiles').select('created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);
  for (const r of [pending, info, rejected, approved, oldest]) if (r.error) throw r.error;
  return {
    pending: pending.count ?? 0,
    infoRequested: info.count ?? 0,
    rejected30d: rejected.count ?? 0,
    approved30d: approved.count ?? 0,
    oldestPendingAt: (oldest.data as { created_at: string } | null)?.created_at ?? null,
  };
}

/**
 * Counter for the settings navigation / dashboard badges: registrations waiting for HR
 * (`pending`). Returns 0 for users who can't review registrations. Never throws.
 */
export async function getPendingRegistrationsCount(ctx: SessionContext | null): Promise<number> {
  if (!ctx || !hasAny(ctx, ['users.view', 'users.approve'])) return 0;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    console.error('[users] pending registrations count failed:', error instanceof Error ? error.message : error);
    return 0;
  }
}

/* ─── employee picker ──────────────────────────────────────────────────────── */

export async function searchEmployeesForLinking(q: string, limit = 20): Promise<EmployeePickerOption[]> {
  const supabase = await createClient();
  let query = supabase
    .from('employees')
    .select(`${EMPLOYEE_REF}, department:departments!department_id(name_ar, name_en), job_title:job_titles!job_title_id(name_ar, name_en)`)
    .is('archived_at', null);
  const term = q.trim().toLowerCase();
  if (term) query = query.ilike('search_text', toIlikePattern(term));
  const { data, error } = await query.order('name_ar', { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as (EmployeeRef & {
    department: { name_ar: string | null; name_en: string | null } | null;
    job_title: { name_ar: string | null; name_en: string | null } | null;
  })[];
  const ids = rows.map((r) => r.id);
  const linked = new Set<string>();
  if (ids.length) {
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('employee_id').in('employee_id', ids);
    if (pErr) throw pErr;
    for (const p of profiles ?? []) if (p.employee_id) linked.add(p.employee_id);
  }
  return rows.map((r) => ({
    id: r.id,
    employeeNumber: r.employee_number,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    departmentAr: r.department?.name_ar ?? null,
    departmentEn: r.department?.name_en ?? null,
    jobTitleAr: r.job_title?.name_ar ?? null,
    jobTitleEn: r.job_title?.name_en ?? null,
    linked: linked.has(r.id),
  }));
}

/** Portal accounts without an employee link (Portal access card › "Link existing user"). */
export async function searchUnlinkedUsers(
  q: string,
  options: { excludeSuperAdmins: boolean },
  limit = 20,
): Promise<{ id: string; fullName: string | null; email: string | null; status: ProfileStatus }[]> {
  const supabase = await createClient();
  let query = supabase.from('profiles').select('id, full_name, email, status').is('employee_id', null).in('status', ['active', 'disabled']);
  if (options.excludeSuperAdmins) {
    // Only a super admin may link a super admin account (set_user_employee) — don't offer them.
    const { data: supers, error: superError } = await supabase.from('user_roles').select('user_id, role:roles!inner(key)').eq('role.key', 'super_admin');
    if (superError) throw superError;
    const ids = (supers ?? []).map((r) => r.user_id);
    if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`);
  }
  const term = q.trim();
  if (term) {
    const pattern = toIlikePattern(term);
    query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data, error } = await query.order('full_name', { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, fullName: p.full_name, email: p.email, status: p.status as ProfileStatus }));
}

/** Convenience for pages: which management abilities the viewer has on the Users screens. */
export function userAbilities(ctx: SessionContext) {
  return {
    canInvite: can(ctx, 'users.create') && can(ctx, 'users.administer'),
    canEdit: can(ctx, 'users.edit'),
    canAdminister: can(ctx, 'users.administer'),
    canApprove: hasAny(ctx, ['users.approve', 'users.edit']),
    canExport: can(ctx, 'users.export'),
    isSuperAdmin: ctx.isSuperAdmin,
    selfId: ctx.user.id,
  };
}
export type UserAbilities = ReturnType<typeof userAbilities>;
