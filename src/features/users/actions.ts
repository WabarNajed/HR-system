'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import {
  inviteUser,
  linkEmployee,
  resendInvitation,
  sendPasswordReset,
  setUserStatus,
  unlinkEmployee,
} from '@/lib/auth/provisioning';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { searchEmployeesForLinking, searchUnlinkedUsers } from './queries';
import { deliverRegistrationEmails } from './registration-emails';
import {
  approveRegistrationSchema,
  employeeSearchSchema,
  inviteUserSchema,
  linkEmployeeSchema,
  reviewNoteSchema,
  setRolesSchema,
  setStatusSchema,
  userIdSchema,
} from './schemas';
import type { EmployeePickerOption } from './types';

/**
 * Users & registrations Server Actions. Each re-checks the permission server-side (the RPCs check
 * again in the database) and returns i18n keys.
 */

function revalidateUsers() {
  revalidatePath('/settings/users');
  revalidatePath('/settings/pending-registrations');
  revalidatePath('/settings/roles');
}

/* ─── users ────────────────────────────────────────────────────────────────── */

export const inviteUserAction = withAction(
  inviteUserSchema,
  async (input) => {
    const result = await inviteUser({ ...input, employeeId: input.employeeId ?? null });
    if (result.ok) revalidateUsers();
    return result;
  },
  { scope: 'users.invite' },
);

export const setUserRolesAction = withAction(
  setRolesSchema,
  async ({ userId, roleKeys }, { ctx }) => {
    requirePermissionIn(ctx, 'users.administer');
    const supabase = await createClient();
    if (!ctx.isSuperAdmin) {
      if (roleKeys.includes('super_admin')) throw new ActionError('users.errors.superAdminOnly');
      const { data, error } = await supabase.from('user_roles').select('role:roles!inner(key)').eq('user_id', userId).eq('role.key', 'super_admin');
      if (error) throw error;
      if ((data ?? []).length) throw new ActionError('users.errors.superAdminOnly');
    }
    const { error } = await supabase.rpc('set_user_roles', { p_user_id: userId, p_role_keys: Array.from(new Set(roleKeys)) });
    if (error) throw error;
    revalidateUsers();
    return ok(undefined, 'users.toast.rolesUpdated');
  },
  { scope: 'users.setRoles' },
);

export const setUserStatusAction = withAction(
  setStatusSchema,
  async ({ userId, status }) => {
    const result = await setUserStatus(userId, status);
    if (result.ok) revalidateUsers();
    return result;
  },
  { scope: 'users.setStatus' },
);

export const linkEmployeeAction = withAction(
  linkEmployeeSchema,
  async ({ userId, employeeId }) => {
    const result = await linkEmployee(userId, employeeId);
    if (result.ok) revalidateUsers();
    return result;
  },
  { scope: 'users.linkEmployee' },
);

export const unlinkEmployeeAction = withAction(
  userIdSchema,
  async ({ userId }) => {
    const result = await unlinkEmployee(userId);
    if (result.ok) revalidateUsers();
    return result;
  },
  { scope: 'users.unlinkEmployee' },
);

export const resendInvitationAction = withAction(userIdSchema, async ({ userId }) => resendInvitation(userId), { scope: 'users.resendInvitation' });

export const sendPasswordResetAction = withAction(userIdSchema, async ({ userId }) => sendPasswordReset({ userId }), {
  scope: 'users.sendPasswordReset',
});

/** Employee picker search (link / approve / invite dialogs). */
export const searchEmployeesAction = withAction(
  employeeSearchSchema,
  async ({ q }, { ctx }) => {
    requirePermissionIn(ctx, 'users.view', 'users.edit', 'users.approve', 'users.create');
    const rows: EmployeePickerOption[] = await searchEmployeesForLinking(q);
    return ok(rows);
  },
  { scope: 'users.searchEmployees' },
);

/** Portal accounts without an employee link (Portal access card). */
export const searchUnlinkedUsersAction = withAction(
  employeeSearchSchema,
  async ({ q }, { ctx }) => {
    requirePermissionIn(ctx, 'users.edit');
    return ok(await searchUnlinkedUsers(q, { excludeSuperAdmins: !ctx.isSuperAdmin }));
  },
  { scope: 'users.searchUnlinkedUsers' },
);

/* ─── registrations ────────────────────────────────────────────────────────── */

export const approveRegistrationAction = withAction(
  approveRegistrationSchema,
  async ({ profileId, employeeId, roleKey, alsoManager }, { ctx }) => {
    requirePermissionIn(ctx, 'users.approve', 'users.edit');
    if (roleKey === 'super_admin' && !ctx.isSuperAdmin) throw new ActionError('users.errors.superAdminOnly');
    const supabase = await createClient();
    const { error } = await supabase.rpc('approve_registration', {
      p_profile_id: profileId,
      p_role_key: roleKey,
      ...(employeeId ? { p_employee_id: employeeId } : {}),
    });
    if (error) throw error;

    let message = 'users.toast.approved';
    if (alsoManager && roleKey !== 'manager') {
      if (can(ctx, 'users.administer')) {
        const { data: current, error: rolesError } = await supabase.from('user_roles').select('role:roles(key)').eq('user_id', profileId);
        if (rolesError) throw rolesError;
        const keys = new Set((current ?? []).map((r) => (r.role as { key: string } | null)?.key).filter((k): k is string => Boolean(k)));
        keys.add(roleKey);
        keys.add('manager');
        const { error: setError } = await supabase.rpc('set_user_roles', { p_user_id: profileId, p_role_keys: Array.from(keys) });
        if (setError) {
          console.error('[users] adding manager role after approval failed:', setError.code, setError.message);
          message = 'users.toast.approvedWithoutManager';
        }
      } else {
        message = 'users.toast.approvedWithoutManager';
      }
    }
    after(() => deliverRegistrationEmails(profileId, ['registration_approved']));
    revalidateUsers();
    return ok(undefined, message);
  },
  { scope: 'users.approveRegistration' },
);

export const rejectRegistrationAction = withAction(
  reviewNoteSchema,
  async ({ profileId, note }, { ctx }) => {
    requirePermissionIn(ctx, 'users.approve', 'users.edit');
    const supabase = await createClient();
    const { error } = await supabase.rpc('reject_registration', { p_profile_id: profileId, p_reason: note });
    if (error) throw error;
    after(() => deliverRegistrationEmails(profileId, ['registration_rejected']));
    revalidateUsers();
    return ok(undefined, 'users.toast.rejected');
  },
  { scope: 'users.rejectRegistration' },
);

export const requestRegistrationInfoAction = withAction(
  reviewNoteSchema,
  async ({ profileId, note }, { ctx }) => {
    requirePermissionIn(ctx, 'users.approve', 'users.edit');
    const supabase = await createClient();
    const { error } = await supabase.rpc('request_registration_info', { p_profile_id: profileId, p_note: note });
    if (error) throw error;
    after(() => deliverRegistrationEmails(profileId, ['registration_info_requested']));
    revalidateUsers();
    return ok(undefined, 'users.toast.infoRequested');
  },
  { scope: 'users.requestRegistrationInfo' },
);
