import 'server-only';

import { getLocale } from 'next-intl/server';
import { cache } from 'react';
import { isLocale, type Locale } from '@/lib/i18n/config';
import {
  ALL_PERMISSIONS,
  HR_ROLE_KEYS,
  isPermission,
  pickPrimaryRole,
  type Permission,
  type RoleKey,
} from '@/lib/permissions';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import { fileRouteUrl } from '@/lib/storage';

/**
 * Session context for the current request — loaded once and memoized with React `cache()`,
 * so the (app) layout, guards and pages share a single set of queries.
 *
 * Queries (RLS as the user):
 *   wave 1 (parallel): profiles row · user_roles → roles → role_permissions
 *   wave 2 (parallel, active users with a linked employee): employee card · direct-report count
 */

export type ProfileStatus = 'pending' | 'info_requested' | 'active' | 'rejected' | 'disabled';

export type SessionProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  mobile: string | null;
  status: ProfileStatus;
  employeeId: string | null;
  preferredLanguage: Locale | null;
  theme: 'light' | 'dark' | 'system';
  lastLoginAt: string | null;
  /** HR note when more information was requested / registration rejected. */
  reviewNote: string | null;
  registrationNote: string | null;
  registrationEmployeeNumber: string | null;
  createdAt: string | null;
};

export type SessionRole = { key: RoleKey; nameAr: string | null; nameEn: string | null };

export type SessionEmployee = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  job_title: { name_ar: string | null; name_en: string | null } | null;
  department: { name_ar: string | null; name_en: string | null } | null;
  /** Download route for the avatar (`/api/files/…`, access-checked) or null. */
  avatar: string | null;
  manager_id: string | null;
};

export type SessionContext = {
  user: { id: string; email: string | null };
  profile: SessionProfile;
  roles: RoleKey[];
  roleDetails: SessionRole[];
  primaryRole: RoleKey | null;
  permissions: Set<Permission>;
  employee: SessionEmployee | null;
  locale: Locale;
  isHR: boolean;
  isSuperAdmin: boolean;
  /** Has the manager role or at least one direct report. */
  isManager: boolean;
  directReportsCount: number;
};

export type SessionState =
  | { status: 'anonymous' }
  | { status: 'unavailable'; reason: 'not_configured' | 'backend' }
  | { status: 'authenticated'; ctx: SessionContext };

const PROFILE_STATUSES: readonly ProfileStatus[] = ['pending', 'info_requested', 'active', 'rejected', 'disabled'];

type AuthLikeError = { name?: string; status?: number; message?: string; code?: string } | null | undefined;

/** Network/timeouts/5xx from GoTrue → backend unavailable (vs. an invalid/missing session). */
export function isAuthBackendError(error: AuthLikeError): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError' || error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  if (typeof error.status === 'number' && (error.status === 0 || error.status >= 500)) return true;
  return /fetch failed|network|timed? ?out|aborted|ECONNREFUSED/i.test(error.message ?? '');
}

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  mobile: string | null;
  status: string | null;
  employee_id: string | null;
  preferred_language: string | null;
  theme: string | null;
  last_login_at: string | null;
  review_note?: string | null;
  registration_note?: string | null;
  registration_employee_number?: string | null;
  created_at?: string | null;
};

type RoleRow = {
  role: {
    key: string;
    name_ar: string | null;
    name_en: string | null;
    role_permissions: { module: string; action: string }[] | null;
  } | null;
};

type EmployeeRow = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  avatar_path: string | null;
  manager_id: string | null;
  job_title: { name_ar: string | null; name_en: string | null } | null;
  department: { name_ar: string | null; name_en: string | null } | null;
};

function toProfile(row: ProfileRow | null, userId: string, email: string | null): SessionProfile {
  const status = PROFILE_STATUSES.includes(row?.status as ProfileStatus) ? (row!.status as ProfileStatus) : 'pending';
  const theme = row?.theme === 'light' || row?.theme === 'dark' ? row.theme : 'system';
  return {
    id: row?.id ?? userId,
    email: row?.email ?? email,
    fullName: row?.full_name ?? null,
    mobile: row?.mobile ?? null,
    status,
    employeeId: row?.employee_id ?? null,
    preferredLanguage: isLocale(row?.preferred_language) ? row.preferred_language : null,
    theme,
    lastLoginAt: row?.last_login_at ?? null,
    reviewNote: row?.review_note ?? null,
    registrationNote: row?.registration_note ?? null,
    registrationEmployeeNumber: row?.registration_employee_number ?? null,
    createdAt: row?.created_at ?? null,
  };
}

async function loadEmployee(
  supabase: ServerSupabaseClient,
  employeeId: string,
): Promise<{ employee: SessionEmployee | null; reports: number }> {
  const [employeeRes, reportsRes] = await Promise.all([
    supabase
      .from('employees')
      .select(
        'id, employee_number, name_ar, name_en, avatar_path, manager_id, job_title:job_titles!job_title_id(name_ar, name_en), department:departments!department_id(name_ar, name_en)',
      )
      .eq('id', employeeId)
      .maybeSingle(),
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('manager_id', employeeId).is('archived_at', null),
  ]);

  if (employeeRes.error) console.error('[session] employee lookup failed:', employeeRes.error.code, employeeRes.error.message);
  if (reportsRes.error) console.error('[session] direct-report count failed:', reportsRes.error.code, reportsRes.error.message);

  const row = (employeeRes.data ?? null) as EmployeeRow | null;
  const employee: SessionEmployee | null = row
    ? {
        id: row.id,
        employee_number: row.employee_number,
        name_ar: row.name_ar,
        name_en: row.name_en,
        job_title: row.job_title ?? null,
        department: row.department ?? null,
        avatar: row.avatar_path ? fileRouteUrl('employee-documents', row.avatar_path) : null,
        manager_id: row.manager_id,
      }
    : null;
  return { employee, reports: reportsRes.count ?? 0 };
}

/** Full session state for the request (memoized). Never throws. */
export const getSessionState = cache(async (): Promise<SessionState> => {
  if (!isSupabaseConfigured()) return { status: 'unavailable', reason: 'not_configured' };

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError && isAuthBackendError(claimsError)) {
      console.error('[session] auth backend unavailable:', claimsError.message);
      return { status: 'unavailable', reason: 'backend' };
    }
    const claims = claimsData?.claims;
    const userId = typeof claims?.sub === 'string' ? claims.sub : null;
    if (!userId) return { status: 'anonymous' };
    const email = typeof claims?.email === 'string' ? claims.email : null;

    const [profileRes, rolesRes, locale] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, email, full_name, mobile, status, employee_id, preferred_language, theme, last_login_at, review_note, registration_note, registration_employee_number, created_at',
        )
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('user_roles').select('role:roles(key, name_ar, name_en, role_permissions(module, action))').eq('user_id', userId),
      getLocale(),
    ]);

    if (profileRes.error) {
      console.error('[session] profile lookup failed:', profileRes.error.code, profileRes.error.message);
      return { status: 'unavailable', reason: 'backend' };
    }
    const profile = toProfile((profileRes.data ?? null) as ProfileRow | null, userId, email);
    const active = profile.status === 'active';

    if (rolesRes.error) console.error('[session] roles lookup failed:', rolesRes.error.code, rolesRes.error.message);
    const roleRows = active ? (((rolesRes.data ?? []) as unknown as RoleRow[]) ?? []) : [];
    const roleDetails: SessionRole[] = [];
    const permissions = new Set<Permission>();
    for (const r of roleRows) {
      if (!r.role?.key) continue;
      roleDetails.push({ key: r.role.key, nameAr: r.role.name_ar, nameEn: r.role.name_en });
      for (const p of r.role.role_permissions ?? []) {
        const key = `${p.module}.${p.action}`;
        if (isPermission(key)) permissions.add(key);
      }
    }
    const roles = roleDetails.map((r) => r.key);
    const isSuperAdmin = roles.includes('super_admin');
    if (isSuperAdmin) for (const p of ALL_PERMISSIONS) permissions.add(p);
    const isHR = roles.some((r) => (HR_ROLE_KEYS as readonly string[]).includes(r));

    let employee: SessionEmployee | null = null;
    let directReportsCount = 0;
    if (active && profile.employeeId) {
      const loaded = await loadEmployee(supabase, profile.employeeId);
      employee = loaded.employee;
      directReportsCount = loaded.reports;
    }

    const ctx: SessionContext = {
      user: { id: userId, email: profile.email ?? email },
      profile,
      roles,
      roleDetails,
      primaryRole: pickPrimaryRole(roles),
      permissions,
      employee,
      locale,
      isHR,
      isSuperAdmin,
      isManager: roles.includes('manager') || directReportsCount > 0,
      directReportsCount,
    };
    return { status: 'authenticated', ctx };
  } catch (error) {
    console.error('[session] failed to load session:', error instanceof Error ? error.message : error);
    return { status: 'unavailable', reason: 'backend' };
  }
});

/** The signed-in user's context, or `null` when signed out / unavailable. Memoized per request. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const state = await getSessionState();
  return state.status === 'authenticated' ? state.ctx : null;
}

/** Serializable subset for client components (PermissionsProvider, shell). */
export function toClientSession(ctx: SessionContext) {
  return {
    userId: ctx.user.id,
    email: ctx.user.email,
    fullName: ctx.profile.fullName,
    roles: ctx.roles,
    roleDetails: ctx.roleDetails,
    primaryRole: ctx.primaryRole,
    permissions: Array.from(ctx.permissions),
    isHR: ctx.isHR,
    isSuperAdmin: ctx.isSuperAdmin,
    isManager: ctx.isManager,
    employee: ctx.employee,
  };
}

export type ClientSession = ReturnType<typeof toClientSession>;
